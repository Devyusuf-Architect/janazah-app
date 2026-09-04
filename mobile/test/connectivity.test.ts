// The connection states, and the one that matters most.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  connectionOf, connectionMessage, type ReadState,
} from '../src/lib/connectivity.ts';

const state = (over: Partial<ReadState> = {}): ReadState => ({
  isPending: false, isError: false, fromCache: false, hasContent: true, ...over,
});

test('a read that reached the server is live', () => {
  assert.equal(connectionOf(state()), 'live');
});

test('a read served from this phone is cached, never live', () => {
  // The property the whole module exists for: content that came off the
  // device is labelled, so a Janazah time that has since moved is never shown
  // as though it were current.
  assert.equal(connectionOf(state({ fromCache: true })), 'cached');
  assert.notEqual(connectionOf(state({ fromCache: true })), 'live');
});

test('a failure with something already on screen is cached, not an error', () => {
  // A refresh failing behind content the reader is looking at is not a blank
  // error screen. It is the same content, now known to be old.
  assert.equal(
    connectionOf(state({ isError: true, hasContent: true })), 'cached',
  );
});

test('a failure with nothing to show is unreachable', () => {
  assert.equal(
    connectionOf(state({ isError: true, hasContent: false })), 'unreachable',
  );
});

test('pending outranks everything else', () => {
  assert.equal(
    connectionOf(state({ isPending: true, isError: true, fromCache: true })),
    'loading',
  );
});

test('live and loading say nothing; the other two say something', () => {
  assert.equal(connectionMessage('live'), null);
  assert.equal(connectionMessage('loading'), null);
  assert.ok(connectionMessage('cached'));
  assert.ok(connectionMessage('unreachable'));
});

test('no message mentions a cache', () => {
  // The reader is standing outside a masjid, not reading a stack trace.
  for (const connection of ['cached', 'unreachable'] as const) {
    assert.doesNotMatch(connectionMessage(connection) ?? '', /cache/i);
  }
});
