// Sample data, and the one thing that must never happen.
//
// The web app ships with sample data on so testers see a populated site. This
// app ships with it off, and the difference matters: a Play reviewer, or
// anybody who downloads Ta'ziyah from the store, must never be shown a
// fictional funeral notice. A binary cannot be corrected with a one-word edit
// and a redeploy the way the web app can.
//
// The switch is an administrator's, read once at launch from
// platformSettings/sampleData. What is checked here is that every path other
// than "an administrator deliberately turned it on" leaves it off, and that
// nothing in the app renders a sample without asking.
//
// src/lib/sample.ts imports native Firebase, which node --test cannot load,
// so this reads the source rather than running it. That is the same technique
// as test/location.test.ts and for the same reason: the property is
// structural, and a structural check that runs is worth more than a runtime
// check that cannot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sample = readFileSync(resolve(root, 'src/lib/sample.ts'), 'utf8');

test('sample mode starts off', () => {
  assert.match(sample, /let enabled = false;/);
});

test('a failed read leaves sample mode off', () => {
  // The failure that matters: no network at launch. If that threw the app
  // into sample mode, the first thing a reviewer on aeroplane wifi would see
  // is an invented funeral.
  assert.match(sample, /catch\s*\{\s*enabled = false;\s*\}/);
});

test('every sample accessor checks the switch first', () => {
  // sampleNotices() and sampleOrganizations() are the only two ways fictional
  // records enter the app, and both must return nothing when the switch is
  // off, rather than relying on their callers to remember.
  for (const fn of ['sampleNotices', 'sampleOrganizations']) {
    const start = sample.indexOf(`export function ${fn}`);
    assert.notEqual(start, -1, `${fn} is gone`);
    const body = sample.slice(start, start + 200);
    assert.match(
      body, /if \(!enabled\) return \[\];/,
      `${fn} does not check the switch before returning records`,
    );
  }
});

test('the app never imports the design harness', () => {
  // preview/ renders components against fictional data in a browser. It is
  // not part of the Metro graph and must never become part of it: a stray
  // import would put "Fulan ibn Fulan" and a section labelled HOME HEADER
  // into a shipped binary.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (/\.tsx?$/.test(entry)) files.push(full);
    }
  };
  walk(resolve(root, 'app'));
  walk(resolve(root, 'src'));

  const offenders = files
    .filter((file) => /from\s+'[^']*\bpreview\//.test(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file));

  assert.deepEqual(offenders, []);
});
