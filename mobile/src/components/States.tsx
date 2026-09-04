// Empty, loading, error and offline states.
//
// Two rules, both from the brief and both easy to get wrong:
//
//   An empty or disabled state must not consume half the screen. These are
//   one row of text and at most one action.
//
//   Stale content is never presented as current. That is said by
//   ConnectionBanner in src/components/Connection.tsx, which used to live
//   here as StaleBanner and moved out when the app grew a proper set of
//   connection states rather than one boolean.

import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useColors, space } from '../theme';
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
