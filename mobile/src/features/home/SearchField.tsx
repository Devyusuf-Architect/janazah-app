// The search entry point on Home.
//
// A button that looks like a field, not a live input. Tapping it moves to the
// Janazahs tab, which owns the keyboard and the results. A real input here
// would mean the results had nowhere to go but on top of Home.
//
// It sits on the green header band, so its colours come from the brand roles
// rather than the surface ones. Reusing the page palette here would put a
// cream box on a green ground, which is the single most common way a header
// like this goes wrong.

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
      onPress={() => router.push('/(tabs)/janazahs?focus=1')}
      style={({ pressed }) => ({
        minHeight: HIT_SLOP_MIN,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.brandDeep,
        backgroundColor: colors.brandDeep,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Circle
          cx="11" cy="11" r="6.5"
          stroke={colors.onBrandMuted} strokeWidth={1.8} fill="none"
        />
        <Path
          d="m16 16 4 4"
          stroke={colors.onBrandMuted} strokeWidth={1.8} strokeLinecap="round"
        />
      </Svg>
      <View style={{ flex: 1 }}>
        <Text variant="body" style={{ color: colors.onBrandMuted }}>
          Search Janazah, Masjid, city…
        </Text>
      </View>
    </Pressable>
  );
}
