// The four things a list can be doing, and the one it must never claim.
//
// This is a regression test with a screenshot behind it. The masjid page
// showed a loading skeleton under UPCOMING that never went away, for a masjid
// that simply had nothing published. TanStack Query reports a disabled query
// as status 'pending', the same value it reports mid-request, and the screen
// read that alone.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { listState } from '../src/lib/list-state';

describe('what a list is doing', () => {
  test('a request in flight is loading', () => {
    assert.equal(listState({ status: 'pending', fetchStatus: 'fetching', count: 0 }), 'loading');
  });

  test('a query that was never enabled is idle, not loading', () => {
    // The bug. Pending with nothing in flight is a query that has not been
    // asked and is not going to be, so a skeleton for it waits on nothing.
    assert.equal(listState({ status: 'pending', fetchStatus: 'idle', count: 0 }), 'idle');
  });

  test('a finished request with no rows is empty', () => {
    assert.equal(listState({ status: 'success', fetchStatus: 'idle', count: 0 }), 'empty');
  });

  test('a finished request with rows is ready', () => {
    assert.equal(listState({ status: 'success', fetchStatus: 'idle', count: 3 }), 'ready');
  });

  test('a failure is a failure whatever else is true', () => {
    assert.equal(listState({ status: 'error', fetchStatus: 'idle', count: 0 }), 'error');
    assert.equal(listState({ status: 'error', fetchStatus: 'fetching', count: 5 }), 'error');
  });

  test('a background refetch of a loaded list is never a skeleton', () => {
    // Re-fetching with rows already on screen must keep showing them.
    assert.equal(listState({ status: 'success', fetchStatus: 'fetching', count: 2 }), 'ready');
  });

  test('no state means "waiting" after the request is done', () => {
    for (const fetchStatus of ['idle', 'fetching', 'paused'] as const) {
      const state = listState({ status: 'success', fetchStatus, count: 0 });
      assert.notEqual(state, 'loading');
    }
  });
});
