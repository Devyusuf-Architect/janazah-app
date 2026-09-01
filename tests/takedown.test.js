// The family takedown request.
//
// feed.js and the admin views cannot be imported directly in a plain Node
// test: they pull in firebase.js, which expects a browser. That is also true
// of the existing rules and duplicate-detection tests, which is why this
// follows the same approach as tests/sample-data.test.js: check the source
// text for the specific things that must hold, rather than executing the
// module. The browser end-to-end test is what actually drives this flow in a
// real page.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const { FAMILY_TAKEDOWN_TARGET } = await import('../public/js/takedown-policy.js');

describe('the family takedown reason', () => {
  test('the shared response-time target is a non-empty string', () => {
    assert.equal(typeof FAMILY_TAKEDOWN_TARGET, 'string');
    assert.ok(FAMILY_TAKEDOWN_TARGET.length > 0);
  });

  test('is offered in the report dialog, and listed first', () => {
    const source = readFileSync('public/js/views/feed.js', 'utf8');
    assert.match(source, /value:\s*'family_takedown'/);
    const reasons = source.slice(
      source.indexOf('const REPORT_REASONS'), source.indexOf('];') + 2);
    assert.equal(reasons.indexOf('family_takedown'), reasons.indexOf("value: '") + 8,
      'family_takedown should be the first entry, since it is the most ' +
      'time-sensitive reason someone can select');
  });

  test('is labelled distinctly in the admin triage view, not left to the raw value', () => {
    const source = readFileSync('public/js/views/admin/reports.js', 'utf8');
    assert.match(source, /family_takedown:\s*'Family takedown request'/);
  });

  test('open family requests are sorted ahead of other open reports', () => {
    const source = readFileSync('public/js/views/admin/reports.js', 'utf8');
    assert.match(source, /family_takedown[\s\S]{0,80}\.sort\(|\.sort\([\s\S]{0,80}family_takedown/);
  });

  test('the same response-time target is quoted on the privacy page and in the report dialog', () => {
    for (const file of ['public/js/views/privacy.js', 'public/js/views/feed.js']) {
      const source = readFileSync(file, 'utf8');
      assert.match(source, /FAMILY_TAKEDOWN_TARGET/,
        `${file} should import the shared target rather than hard-coding a number`);
    }
  });

  test('the privacy page documents the flow as concrete steps, not only a policy statement', () => {
    const source = readFileSync('public/js/views/privacy.js', 'utf8');
    assert.match(source, /Asking for a notice to come down/);
    assert.match(source, /Report a problem/);
    assert.match(source, /<ol|el\('ol'/,
      'expected the request steps as an ordered list, not prose alone');
  });

  test('the terms page references the takedown process rather than being silent on it', () => {
    const source = readFileSync('public/js/views/terms.js', 'utf8');
    assert.match(source, /faster path|takedown/i);
  });
});
