// Empty, loading, error and offline states.
//
// Two rules, both from the brief and both easy to get wrong:
//
//   An empty or disabled state must not consume half the screen. These are
//   one row of text and at most one action.
//
//   Stale content is never presented as current. StaleBanner is what says so,
//   and it is the caller's job to show it whenever cached notices are being
//   displayed without a successful refresh behind them.

import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useColors, radius, space } from '@/theme';
import { Text } from './Text';
import { Button } from './Button';

export function Loading({ label = 'Loading' }: { label?: string }) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ paddingVertical: space.xl, alignItems: 'center' }}
    >
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function Empty({ message, action }: {
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ paddingVertical: space.lg, gap: space.md }}>
      <Text tone="muted" variant="callout">{message}</Text>
      {action
        ? <Button label={action.label} onPress={action.onPress} size="compact" />
        : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ paddingVertical: space.lg, gap: space.md }}>
      <Text tone="muted" variant="callout">{message}</Text>
      {onRetry
        ? <Button label="Try again" onPress={onRetry} size="compact" />
        : null}
    </View>
  );
}

/**
 * Shown above cached content when the app could not reach Firestore.
 *
 * A funeral time that has since changed is worse than no funeral time, so
 * this says plainly that what follows may be out of date rather than letting
 * it pass as current.
 */
export function StaleBanner({ onRetry }: { onRetry?: () => void }) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        marginHorizontal: space.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        backgroundColor: colors.goldSoft,
        borderColor: colors.goldLine,
      }}
    >
      <Text variant="caption" style={{ flex: 1, color: colors.gold }}>
        You are offline. These notices were saved earlier and may have changed.
      </Text>
      {onRetry
        ? <Button label="Retry" onPress={onRetry} size="compact" />
        : null}
    </View>
  );
}
