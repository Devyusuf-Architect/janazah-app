// What a list should be showing, from what its query is actually doing.
//
// This exists because of a real bug, and one that looked like a hang. The
// masjid screen showed a loading skeleton under UPCOMING that never went
// away for a masjid with no notices. The query was not slow and had not
// failed: it had never run. TanStack Query reports a *disabled* query as
// `status: 'pending'`, the same value it reports while a request is in
// flight, and the screen was reading isPending alone. A skeleton that
// outlives its request tells somebody the app is broken; a skeleton for a
// request that was never made tells them nothing at all.
//
// fetchStatus is what separates the two. 'idle' with a pending status means
// nothing is happening and nothing is going to, so there is nothing to wait
// for and the screen should say so.
//
// Pure, and deliberately not a hook: the four cases are worth testing
// directly. See test/list-state.test.ts.

export type ListState = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

export function listState(query: {
  /** TanStack's status: 'pending' until the first successful result. */
  status: 'pending' | 'error' | 'success';
  /** TanStack's fetchStatus: 'idle' when no request is in flight. */
  fetchStatus: 'fetching' | 'paused' | 'idle';
  /** How many rows the result holds. Ignored unless the query succeeded. */
  count: number;
}): ListState {
  if (query.status === 'error') return 'error';
  if (query.status === 'pending') {
    // Disabled, or waiting on something that will never come. Never a
    // skeleton: there is no request to be the skeleton for.
    return query.fetchStatus === 'idle' ? 'idle' : 'loading';
  }
  return query.count === 0 ? 'empty' : 'ready';
}
