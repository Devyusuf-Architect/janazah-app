// The way to the guide, from Home.
//
// It sits at the bottom rather than the top on purpose. Somebody who opened
// this app because a funeral is in two hours needs the time and the address
// first; somebody who has never prayed Salat al-Janazah and is worried about
// it will scroll, and will find this.
//
// It is a quiet row, not a call to action. Nothing about learning the prayer
// should feel like a product feature being promoted.

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { useColors, radius, space, HIT_SLOP_MIN } from '../../theme';

export function GuideLink() {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="How to pray Salat al-Janazah. A reminder, with each text's source."
      onPress={() => router.push('/guide')}
      style={({ pressed }) => ({
        minHeight: HIT_SLOP_MIN,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: pressed ? colors.pressed : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d="M4 5.4A1.4 1.4 0 0 1 5.4 4H10a2.6 2.6 0 0 1 2 1v13a2.6 2.6 0 0 0-2-1H5.4A1.4 1.4 0 0 1 4 15.6z"
          stroke={colors.accent} strokeWidth={1.6}
          strokeLinejoin="round" fill="none"
        />
        <Path
          d="M20 5.4A1.4 1.4 0 0 0 18.6 4H14a2.6 2.6 0 0 0-2 1v13a2.6 2.6 0 0 1 2-1h4.6a1.4 1.4 0 0 0 1.4-1.4z"
          stroke={colors.accent} strokeWidth={1.6}
          strokeLinejoin="round" fill="none"
        />
      </Svg>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">How to pray Salat al-Janazah</Text>
        <Text variant="caption" tone="subtle">
          A reminder, with each text’s source
        </Text>
      </View>

      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d="m9 6 6 6-6 6"
          stroke={colors.ink3} strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
      </Svg>
    </Pressable>
  );
}
