// The search entry point on Home.
//
// A button that looks like a field, not a live input. Tapping it opens the
// search screen, which owns the keyboard, the results and the history. A real
// input here would mean the results had nowhere to go but on top of the feed.

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { useColors, radius, space, HIT_SLOP_MIN } from '../../theme';

export function SearchField() {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Search Janazah notices, masjids and cities"
      onPress={() => router.push('/search')}
      style={({ pressed }) => ({
        minHeight: HIT_SLOP_MIN,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.pressed : colors.surface,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Circle
          cx="11" cy="11" r="6.5"
          stroke={colors.ink3} strokeWidth={1.8} fill="none"
        />
        <Path
          d="m16 16 4 4"
          stroke={colors.ink3} strokeWidth={1.8} strokeLinecap="round"
        />
      </Svg>
      <View style={{ flex: 1 }}>
        <Text variant="body" tone="subtle">Search Janazah, Masjid, city…</Text>
      </View>
    </Pressable>
  );
}
