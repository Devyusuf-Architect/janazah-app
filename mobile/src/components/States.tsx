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
import Svg, { Path } from 'react-native-svg';

import { useColors, radius, space } from '../theme';
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

/**
 * Nothing here, said without taking over the screen.
 *
 * The mark is a quiet crescent in a soft disc rather than an illustration.
 * The rule from the brief still holds: this is a glyph and a line, not a
 * half-page of artwork apologising for an empty list.
 */
export function Empty({ message, action }: {
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();

  return (
    <View style={{ paddingVertical: space.xl, gap: space.md, alignItems: 'center' }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Svg width={26} height={26} viewBox="0 0 24 24">
          <Path
            d="M16.8 15.6A6.2 6.2 0 0 1 9 7.3a6.6 6.6 0 1 0 7.8 8.3z"
            stroke={colors.ink3} strokeWidth={1.5}
            strokeLinejoin="round" fill="none"
          />
        </Svg>
      </View>
      <Text tone="muted" variant="callout" style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {action
        ? <Button label={action.label} onPress={action.onPress} size="compact" />
        : null}
    </View>
  );
}

/**
 * Something went wrong, said in the same shape as Empty.
 *
 * Centred so the two read as siblings: a reader who sees one on Monday and
 * the other on Tuesday should not feel the app has changed layout underneath
 * them.
 */
export function ErrorState({ message, onRetry }: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={{ paddingVertical: space.xl, gap: space.md, alignItems: 'center' }}>
      <Text tone="muted" variant="callout" style={{ textAlign: 'center' }}>
        {message}
      </Text>
      {onRetry
        ? <Button label="Try again" onPress={onRetry} size="compact" />
        : null}
    </View>
  );
}
