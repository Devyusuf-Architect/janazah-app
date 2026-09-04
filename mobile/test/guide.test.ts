// The Janazah guide.
//
// The rule this protects is stated at the top of
// public/js/janazah-guide-content.js: nothing in it is paraphrased, shortened
// or "tidied", every recitation carries its source, and where the schools of
// law differ both are shown.
//
// A phone screen is exactly where that rule is most likely to be broken, and
// broken for a plausible reason: something has to give, and a note about
// madhhabs looks like the thing that gives. It is not. A guide that quietly
// drops the sentence saying the schools differ is a guide that has started
// making a religious claim it has no business making.
//
// So this test checks that every export of the content module is actually
// rendered. It cannot check that the text is correct, which is a scholar's
// job, but it can check that none of it was silently left out.
//
// It reads the whole guide rather than one file, because the guide is now a
// front page and four screens behind it. Moving a section one tap away is a
// layout decision; dropping it is not, and this is what tells the two apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const content = await import('../../public/js/janazah-guide-content.js');
/** Every file the guide is rendered by, concatenated. */
const body = [
  ...readdirSync(resolve(here, '../src/features/guide'))
    .map((entry) => resolve(here, '../src/features/guide', entry)),
  ...readdirSync(resolve(here, '../app/guide'))
    .map((entry) => resolve(here, '../app/guide', entry)),
].map((file) => readFileSync(file, 'utf8')).join('\n');

const recitation = readFileSync(
  resolve(here, '../src/features/guide/Recitation.tsx'), 'utf8',
);

test('every part of the guide reaches the screen', () => {
  const exported = Object.keys(content).filter((name) => name !== 'default');
  assert.ok(exported.length >= 8, 'the content module lost an export');

  for (const name of exported) {
    assert.ok(
      body.includes(name),
      `${name} is in the guide's content but is never rendered on mobile`,
    );
  }
});

test('the note that the schools of law differ is not cut for space', () => {
  // The single most tempting thing to drop on a small screen, and the one
  // that turns a reminder into a claim.
  assert.ok(body.includes('SCHOOLS_NOTE'));
  assert.match(content.SCHOOLS_NOTE, /differ/i);
});

test('the note that Ta’ziyah is not a religious authority is not cut either', () => {
  assert.ok(body.includes('SCOPE_NOTE'));
  assert.match(content.SCOPE_NOTE, /not a religious authority/i);
});

test('no Arabic appears without either a source or a translation', () => {
  // The rule from the content file is that every recitation carries its
  // source. The takbir call itself is the one thing that reasonably does not:
  // "Allahu Akbar" is not a quotation needing a citation, and it carries a
  // transliteration and a meaning instead. So what is actually checked here
  // is the property underneath that rule, which admits the exception without
  // weakening it: no Arabic is ever printed that a reader can neither trace
  // nor understand.
  //
  // Checked against the data rather than the renderer, because a source that
  // stopped being displayed and a source that stopped existing are different
  // failures and both matter.
  type Quoted = {
    arabic?: string; source?: string; meaning?: string; transliteration?: string;
  };
  const withArabic: Quoted[] = [];
  for (const takbir of content.TAKBIRS) {
    for (const item of takbir.recitations ?? []) withArabic.push(item);
    if (takbir.takbir) withArabic.push(takbir.takbir);
    // childNote and closing are headed passages that may carry Arabic of
    // their own; they are typed more loosely than a recitation.
    if (takbir.childNote) withArabic.push(takbir.childNote as Quoted);
    if (takbir.closing) withArabic.push(takbir.closing as Quoted);
  }
  withArabic.push(content.ISTIRJA);

  for (const item of withArabic) {
    if (!item.arabic) continue;
    assert.ok(
      item.source || (item.meaning && item.transliteration),
      'Arabic with neither a source nor a translation: '
      + `${item.arabic.slice(0, 24)}`,
    );
  }

  // And the renderer shows the source when there is one.
  assert.match(recitation, /item\.source/);
});

test('Arabic is set large, right to left, and never truncated', () => {
  // Somebody reads this standing up, in poor light, moments before praying.
  assert.match(recitation, /writingDirection: 'rtl'/);
  assert.match(recitation, /accessibilityLanguage="ar"/);
  assert.ok(!/numberOfLines/.test(recitation), 'Arabic must never be truncated');
  assert.ok(!/ellipsizeMode/.test(recitation), 'Arabic must never be ellipsized');

  const tokens = readFileSync(resolve(here, '../src/theme/tokens.ts'), 'utf8');
  const block = tokens.match(/export const arabic = \{[\s\S]*?\} as const;/);
  assert.ok(block, 'the Arabic type scale is not declared');
  const sizes = [...block[0].matchAll(/fontSize: (\d+)/g)].map((m) => Number(m[1]));
  const heights = [...block[0].matchAll(/lineHeight: (\d+)/g)].map((m) => Number(m[1]));

  for (const size of sizes) {
    assert.ok(size >= 22, `Arabic at ${size}pt is too small to read while standing`);
  }
  // Naskh needs the leading. Anything under about 1.7 sets the diacritics of
  // one line into the line above it.
  for (const [i, height] of heights.entries()) {
    assert.ok(height / sizes[i]! >= 1.7,
      `line height ${height} on ${sizes[i]}pt Arabic collides the diacritics`);
  }
});

test('the guide is shared, not copied', () => {
  // A second copy of religious text is a second thing for a scholar to
  // review and a second thing to drift.
  const shared = readFileSync(resolve(here, '../src/shared/guide.ts'), 'utf8');
  assert.match(shared, /from '\.\.\/\.\.\/\.\.\/public\/js\/janazah-guide-content\.js'/);
  assert.ok(!/'إ|ٱ|الله/.test(body),
    'the mobile guide contains Arabic of its own; it must render the shared content');
  assert.ok(!/'إ|ٱ|الله/.test(recitation),
    'the recitation component contains Arabic of its own');
});
