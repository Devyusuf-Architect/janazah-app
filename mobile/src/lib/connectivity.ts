// What to tell somebody about the connection.
//
// The app does not ask Android whether it has a network. It does not need to,
// and asking would mean carrying ACCESS_NETWORK_STATE and a dependency for a
// question Firestore has already answered: every read comes back with
// `metadata.fromCache`, which is true exactly when the server could not be
// reached. That is a better signal than the radio's state anyway, because a
// phone can be on wifi that goes nowhere.
//
// So there are three states and they are all derived from reads that have
// already happened:
//
//   live         the last read reached Firestore
//   cached       there is content, but it came off this phone and may
//                have changed since
//   unreachable  there is nothing to show and nothing to show it from
//
// The distinction between the last two is the whole point. A funeral time
// that has since moved is worse than no funeral time, so cached content is
// always labelled as cached, and never presented as current.
//
// Pure, so test/connectivity.test.ts can check it without a device.

export type Connection = 'live' | 'cached' | 'unreachable' | 'loading';

export type ReadState = {
  /** No answer yet, from the cache or otherwise. */
  isPending: boolean;
  /** The read failed outright. */
  isError: boolean;
  /** Firestore served this from the local cache. */
  fromCache: boolean;
  /** Whether there is anything at all to put on the screen. */
  hasContent: boolean;
};

export function connectionOf(state: ReadState): Connection {
  if (state.isPending) return 'loading';
  // An error with content behind it is still a cache hit as far as the reader
  // is concerned: there is something on the screen and it is not current.
  if (state.isError) return state.hasContent ? 'cached' : 'unreachable';
  return state.fromCache ? 'cached' : 'live';
}

/**
 * What the banner says.
 *
 * Written for somebody standing outside a masjid rather than for a developer:
 * it says what they are looking at and what to do, and it never uses the word
 * "cache".
 */
export function connectionMessage(connection: Connection): string | null {
  switch (connection) {
    case 'cached':
      return 'You are offline. This was saved on your phone earlier and may '
        + 'have changed.';
    case 'unreachable':
      return 'Ta’ziyah could not reach the notices. Check your connection and '
        + 'try again.';
    default:
      return null;
  }
}

/**
 * How long to wait before saying a load is taking too long.
 *
 * There is always an answer eventually, because a failed read resolves to an
 * error and Firestore serves the cache instantly when it has one. This exists
 * for the case in between, where a request is neither failing nor arriving,
 * and a spinner alone would sit there indefinitely.
 */
export const SLOW_MS = 8_000;
