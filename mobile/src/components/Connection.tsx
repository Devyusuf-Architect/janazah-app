// The connection banner, and the "this is taking a while" line.
//
// One component rather than a banner per screen, so every list in the app
// says the same thing in the same words about the same state. The words and
// the states themselves are in src/lib/connectivity.ts, which is tested.
//
// The banner slides in rather than appearing, because it pushes content down
// and an unannounced shift under somebody's thumb is how a reader taps the
// wrong notice.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
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
