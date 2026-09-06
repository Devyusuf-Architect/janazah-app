// The connection banner, and the "this is taking a while" line.
//
// One component rather than a banner per screen, so every list in the app
// says the same thing in the same words about the same state. The words and
// the states themselves are in src/lib/connectivity.ts, which is tested.
//
// The banner slides in rather than appearing, because it pushes content down
// and an unannounced shift under somebody's thumb is how a reader taps the
// wrong notice.

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated from 'react-native-reanimated';

import { Text } from './Text';
import { Button } from './Button';
import { useColors, radius, space } from '../theme';
import { enterScreen, exitScreen, useReduceMotion } from '../theme/motion';
import {
  connectionMessage, SLOW_MS, type Connection,
} from '../lib/connectivity';

export function ConnectionBanner({ connection, onRetry }: {
  connection: Connection;
  onRetry?: () => void;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const message = connectionMessage(connection);
  if (!message) return null;

  const bad = connection === 'unreachable';
  const palette = bad
    ? { bg: colors.dangerSoft, border: colors.dangerLine, fg: colors.danger }
    : { bg: colors.goldSoft, border: colors.goldLine, fg: colors.gold };

  return (
    <Animated.View
      entering={enterScreen(reduce)}
      exiting={exitScreen(reduce)}
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        marginHorizontal: space.lg,
        marginTop: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      <View
        style={{
          width: 8, height: 8, borderRadius: 4, backgroundColor: palette.fg,
        }}
      />
      <Text variant="caption" style={{ flex: 1, color: palette.fg }}>
        {message}
      </Text>
      {onRetry ? <Button label="Retry" onPress={onRetry} size="compact" /> : null}
    </Animated.View>
  );
}

/**
 * True once a load has been pending for longer than anybody should watch a
 * skeleton.
 *
 * The brief's rule was that the app must never sit in an infinite loading
 * state. Firestore resolves fast or fails, so this covers the case in
 * between: a request that is neither arriving nor erroring, where a skeleton
 * on its own would animate forever with nothing behind it.
 */
export function useSlowLoad(pending: boolean): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) { setSlow(false); return undefined; }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return slow;
}

/**
 * Retries a failed or cached read on its own, so a connection that comes back
 * is noticed without anybody tapping anything.
 *
 * The app does not watch the radio, and will not start: that means
 * ACCESS_NETWORK_STATE and a dependency for a question Firestore answers on
 * every read. What it can do is try again, on a backoff, while it knows it is
 * not reaching the server. Backing off matters: a fixed interval on a phone
 * left offline in a pocket is a retry loop with nothing at the end of it.
 *
 * Only while the screen is focused, and it stops the moment a read succeeds.
 */
export function useAutoRetry(
  connection: Connection, refetch: () => void,
): void {
  // The count is state rather than a ref, and that is the whole mechanism: a
  // retry that fails leaves the connection exactly as it was, so nothing else
  // in the dependencies changes and the effect would never schedule a second
  // attempt. Bumping this re-runs it with a longer delay.
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(useCallback(() => {
    if (connection === 'live' || connection === 'loading') {
      if (attempt !== 0) setAttempt(0);
      return undefined;
    }

    // 5s, 10s, 20s, 40s, then every minute.
    const delay = Math.min(5_000 * 2 ** attempt, 60_000);
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      refetch();
    }, delay);

    return () => clearTimeout(timer);
  }, [connection, refetch, attempt]));
}

/** Shown under a skeleton that has been there too long. */
export function SlowNotice({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
      <Text variant="callout" tone="muted">
        This is taking longer than usual. You may be offline.
      </Text>
      {onRetry ? <Button label="Try again" size="compact" onPress={onRetry} /> : null}
    </View>
  );
}
