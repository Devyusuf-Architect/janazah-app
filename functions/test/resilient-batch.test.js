// The retry-isolation utility behind item 4 (error monitoring): the actual
// property being verified is that one failing item cannot prevent the rest
// of a batch from being attempted, and that every failure is reported rather
// than silently absorbed.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { eachIndependently } from '../lib/resilient-batch.js';

describe('eachIndependently', () => {
  test('every item is attempted, in order', async () => {
    const seen = [];
    await eachIndependently(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      async (item) => { seen.push(item.id); });
    assert.deepEqual(seen, ['a', 'b', 'c']);
  });

  test('a failure produces no errors when nothing fails', async () => {
    const errors = await eachIndependently(
      [{ id: 'a' }, { id: 'b' }], async () => {});
    assert.deepEqual(errors, []);
  });

  test('an item that throws does not stop the items after it', async () => {
    const seen = [];
    const errors = await eachIndependently(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      async (item) => {
        seen.push(item.id);
        if (item.id === 'b') throw new Error('boom');
      });
    // This is the actual bug being fixed: 'c' must still run.
    assert.deepEqual(seen, ['a', 'b', 'c']);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].docId, 'b');
    assert.match(errors[0].message, /boom/);
  });

  test('multiple failures are all reported, not just the first', async () => {
    const errors = await eachIndependently(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      async (item) => { throw new Error(`fail ${item.id}`); });
    assert.equal(errors.length, 3);
    assert.deepEqual(errors.map((e) => e.docId), ['a', 'b', 'c']);
  });

  test('an empty batch does no work and reports nothing', async () => {
    let called = false;
    const errors = await eachIndependently([], async () => { called = true; });
    assert.equal(called, false);
    assert.deepEqual(errors, []);
  });

  test('a non-Error thrown value is still captured as a readable message', async () => {
    const errors = await eachIndependently(
      [{ id: 'a' }], async () => { throw 'a plain string failure'; });
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /a plain string failure/);
  });

  test('a long failure message is bounded rather than logged unbounded', async () => {
    const errors = await eachIndependently(
      [{ id: 'a' }], async () => { throw new Error('x'.repeat(1000)); });
    assert.ok(errors[0].message.length <= 200);
  });
});
