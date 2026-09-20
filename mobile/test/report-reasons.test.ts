// The report reasons this app offers have to be ones the queue understands.
//
// Reports from the app and from the website land in the same collection, and
// the admin console turns the stored value into a label for whoever triages
// it. The app used to offer 'not_genuine', which appears nowhere in that map,
// so somebody reporting a fake notice from a phone produced a report the
// console could not categorise. The values are the web's; this is what keeps
// them the web's.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

/**
 * The app's own list, read rather than imported.
 *
 * src/lib/report.ts imports the native Firebase SDK, so importing it here
 * would need a device. Every structural test in this directory reads source
 * for the same reason.
 */
function appReasons(): { value: string; label: string }[] {
  const source = read('mobile/src/lib/report.ts');
  const block = source.slice(source.indexOf('export const REPORT_REASONS = ['));
  const body = block.slice(0, block.indexOf('] as const;'));
  return [...body.matchAll(/value:\s*'(\w+)',\s*\n\s*label:\s*'([^']*)'/g)]
    .map((m) => ({ value: String(m[1]), label: String(m[2]) }));
}

const REPORT_REASONS = appReasons();

/** The keys of REPORT_REASON_LABELS in public/js/views/admin.js. */
function adminLabelled(): Set<string> {
  const source = read('public/js/views/admin.js');
  const block = source.slice(source.indexOf('const REPORT_REASON_LABELS = {'));
  const body = block.slice(0, block.indexOf('};'));
  return new Set([...body.matchAll(/^\s*(\w+):/gm)].map((m) => String(m[1])));
}

/** The values offered by the web's own report dialog. */
function webOffered(): Set<string> {
  const source = read('public/js/views/feed.js');
  // From the declaration, not from the first mention of a value: slicing at
  // the value itself cuts the "value:" off the entry it is part of, which
  // silently drops the first reason from the comparison.
  const block = source.slice(source.indexOf('const REPORT_REASONS = ['));
  const body = block.slice(0, block.indexOf('];'));
  return new Set([...body.matchAll(/value: '(\w+)'/g)].map((m) => String(m[1])));
}

describe('report reasons', () => {
  test('every reason the app offers has a label in the admin console', () => {
    const labelled = adminLabelled();
    assert.ok(labelled.size >= 6, 'REPORT_REASON_LABELS did not parse');
    for (const { value } of REPORT_REASONS) {
      assert.ok(
        labelled.has(value),
        `"${value}" has no label in public/js/views/admin.js, so a report `
        + 'filed from the app would arrive uncategorised',
      );
    }
  });

  test('the app offers the same reasons the website does', () => {
    // Not a subset. A reader on a phone and a reader in a browser should be
    // able to report the same things, particularly the privacy one.
    const web = webOffered();
    assert.ok(web.size >= 6, 'the web reason list did not parse');
    const app = new Set<string>(REPORT_REASONS.map((r) => r.value));
    assert.deepEqual([...web].filter((v) => !app.has(v)), []);
    assert.deepEqual([...app].filter((v) => !web.has(v)), []);
  });

  test('a family takedown is the first thing offered', () => {
    // The most time-sensitive reason on the list, and the one somebody is
    // least able to go hunting for.
    assert.equal(REPORT_REASONS[0]!.value, 'family_takedown');
  });

  test('the reasons that matter for moderation are all present', () => {
    const app = new Set<string>(REPORT_REASONS.map((r) => r.value));
    for (const needed of ['fraudulent', 'privacy', 'duplicate', 'incorrect_details']) {
      assert.ok(app.has(needed), `no way to report ${needed}`);
    }
  });

  test('no label is long enough to be cut off on a phone', () => {
    for (const { label } of REPORT_REASONS) {
      assert.ok(label.length <= 48, `"${label}" is too long for one row`);
    }
  });

  test('no label uses an em dash', () => {
    for (const { label } of REPORT_REASONS) {
      assert.equal(label.includes('—'), false, label);
    }
  });
});
