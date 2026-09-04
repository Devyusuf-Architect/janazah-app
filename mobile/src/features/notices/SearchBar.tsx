// A real search field, in the list it filters.
//
// Different from src/features/home/SearchField.tsx, which is a button that
// looks like a field. That one belongs on Home, where results would have
// nowhere to go; this one belongs on the Janazahs tab, where the list under
// it is the result.
//
// It grows a focus ring rather than changing colour, and it carries its own
// clear button on Android, where TextInput has none.

import React, { forwardRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

import { useColors, radius, space, type, HIT_SLOP_MIN } from '../../theme';
import { motion, timing, useReduceMotion } from '../../theme/motion';

type Props = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
};

export const SearchBar = forwardRef<TextInput, Props>(function SearchBar(
  { value, onChangeText, placeholder = 'Search' }, ref,
) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const focus = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    borderColor: focus.value ? colors.accentLine : colors.line,
    backgroundColor: focus.value ? colors.surface : colors.surfaceAlt,
  }));

  const set = (next: number) => {
    focus.value = reduce ? next : withTiming(next, timing(motion.fast));
  };

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: space.md,
          minHeight: HIT_SLOP_MIN,
          borderRadius: radius.md,
          borderWidth: 1,
        },
        style,
      ]}
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

      <TextInput
        ref={ref}
        accessibilityLabel="Search Janazah notices"
        value={value}
        onChangeText={onChangeText}
        onFocus={() => set(1)}
        onBlur={() => set(0)}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, paddingVertical: space.sm, color: colors.ink, ...type.body }}
      />

      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={12}
          onPress={() => onChangeText('')}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Circle cx="12" cy="12" r="9" fill={colors.lineStrong} />
            <Path
              d="m9 9 6 6m0-6-6 6"
              stroke={colors.surface} strokeWidth={2} strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      ) : null}
    </Animated.View>
  );
});
