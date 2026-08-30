// "Some of these are examples."
//
// Shown whenever sample mode is on, on every screen that can show a notice,
// and worded the same way as the web app's banner. A fictional Janazah notice
// that reads as real is the single most harmful thing this application could
// display, so this is deliberately hard to miss and deliberately not
// dismissible.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { useColors, radius, space } from '../../theme';
import { isSampleMode } from '../../lib/sample';

export function SampleBanner() {
  const colors = useColors();
  if (!isSampleMode()) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: space.lg,
        marginTop: space.lg,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        backgroundColor: colors.goldSoft,
        borderColor: colors.goldLine,
      }}
    >
      <Text variant="caption" style={{ color: colors.gold }}>
        <Text variant="caption" style={{ color: colors.gold, fontWeight: '700' }}>
          Sample data.{' '}
        </Text>
        Some notices and masjids here are fictional examples for testing. They
        are not real Janazah notices.
      </Text>
    </View>
  );
}
