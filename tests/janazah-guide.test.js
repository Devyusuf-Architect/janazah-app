// The Janazah prayer guide.
//
// This page carries religious text that people read moments before praying
// over someone who has died. The tests worth having are not about layout;
// they are about the properties that make it safe to publish:
//
//   every recitation is attributed
//   nothing is presented as the only valid practice
//   the page needs no account
//   Arabic is marked as Arabic, so browsers shape it and screen readers
//   switch voice

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const content = await import('../public/js/janazah-guide-content.js');
const view = readFileSync('public/js/views/janazah-guide.js', 'utf8');
const bootstrap = readFileSync('public/js/feed.js', 'utf8');

/** Every recitation object anywhere in the content module. */
const recitations = content.TAKBIRS.flatMap((t) => t.recitations);

describe('religious content is attributed', () => {
  test('every recitation carries a source', () => {
    for (const r of recitations) {
      assert.ok(r.source && r.source.trim().length > 10,
        `"${r.title}" has no usable source`);
    }
  });

  test('every recitation has Arabic, transliteration and a meaning', () => {
    // A reader who cannot read Arabic still has to be able to say it and know
    // what they are saying.
    for (const r of recitations) {
      for (const field of ['arabic', 'transliteration', 'meaning']) {
        assert.ok(r[field] && r[field].trim(),
          `"${r.title}" is missing its ${field}`);
      }
    }
  });

  test('the Arabic really is Arabic script', () => {
    // Guards against a copy-paste that silently drops the Arabic and leaves
    // the transliteration in its place.
    const arabicRange = /[\u0600-\u06FF]/;
    for (const r of recitations) {
      assert.match(r.arabic, arabicRange, `"${r.title}" has no Arabic characters`);
    }
    for (const t of content.TAKBIRS) {
      assert.match(t.takbir.arabic, arabicRange, `takbir ${t.number} has no Arabic`);
    }
  });
});

describe('differences between schools are not flattened', () => {
  test('the page carries the note about differing practice', () => {
    assert.match(content.SCHOOLS_NOTE, /differ/i);
    assert.match(content.SCHOOLS_NOTE, /imam|scholar/i,
      'the note must point somewhere, not just say that people disagree');
    assert.match(view, /SCHOOLS_NOTE/, 'the note must actually be rendered');
  });

  test('the first takbir shows both practices', () => {
    // Fatiha in three schools, Thana in the Hanafi school. Showing only one
    // would tell most of the readers of this app that they are praying wrong.
    const first = content.TAKBIRS.find((t) => t.number === 1);
    assert.equal(first.recitations.length, 2);
    const notes = first.recitations.map((r) => r.note || '').join(' ');
    assert.match(notes, /Hanafi/, 'the Hanafi practice must be named');
    assert.match(notes, /Shafi|Maliki|Hanbali/, 'the majority practice must be named');
  });

  test('the fourth takbir says what the Hanafi school does instead', () => {
    const fourth = content.TAKBIRS.find((t) => t.number === 4);
    assert.match(fourth.recitations.map((r) => r.note || '').join(' '), /Hanafi/);
  });

  test('the guide does not claim religious authority', () => {
    assert.match(content.SCOPE_NOTE, /not a religious authority/i);
  });
});

describe('who is being prayed for', () => {
  test('the dua is not presented as one universal form', () => {
    // Reciting the male form over a woman is the mistake this prevents.
    assert.ok(content.PRONOUN_NOTE.forms.length >= 4);
    const who = content.PRONOUN_NOTE.forms.map(([label]) => label).join(' ');
    for (const expected of [/man/i, /woman/i, /group/i]) {
      assert.match(who, expected);
    }
  });

  test('a child is handled separately, and without unattributed Arabic', () => {
    const third = content.TAKBIRS.find((t) => t.number === 3);
    assert.ok(third.childNote, 'there must be a note for when the deceased is a child');
    assert.match(third.childNote.body, /parents/i,
      'the reason the dua differs should be explained, not just asserted');
    assert.doesNotMatch(third.childNote.body, /[\u0600-\u06FF]/,
      'no Arabic here: the wordings vary by narration and none is attributed');
  });
});

describe('the page is reachable and readable', () => {
  test('it is public: no sign-in, no auth check on the route', () => {
    const route = bootstrap.slice(bootstrap.indexOf("/janazah-guide"),
      bootstrap.indexOf("/janazah-guide") + 300);
    assert.doesNotMatch(route, /authReady|!user|signin/,
      'learning how to pray a Janazah must not require an account');
  });

  test('Arabic is marked as Arabic for shaping and screen readers', () => {
    const arabicNodes = view.match(/lang: 'ar', dir: 'rtl'/g) || [];
    assert.ok(arabicNodes.length >= 4,
      `expected every Arabic block to carry lang and dir; found ${arabicNodes.length}`);
  });

  test('there is a way back to the notices', () => {
    assert.match(view, /href: '\/janazahs'/,
      'a deep page needs an obvious way back');
  });
});
