// Buttons.
//
// Three kinds and no more: the one action that matters on a screen, everything
// else, and something destructive. Plus a `plain` variant for a text action
// that should not look like a button at all.
//
// The press animation is a scale to 0.97 on a spring, driven on the UI thread
// so it stays responsive while a list is scrolling. It is deliberately small.
// A button that visibly squashes is playful, and nothing in this app should
// be playful.
//
// Every kind is at least 48dp tall, which is Android's minimum target and not
// negotiable for an app whose readers are often older and often in a hurry.

import React from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring,
} from 'react-native-reanimated';

import { useColors, radius, space, elevation, HIT_SLOP_MIN } from '../theme';
import { pressSpring, useReduceMotion } from '../theme/motion';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'plain';
  size?: 'regular' | 'compact' | 'large';
  busy?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
  /** For a primary button on a brand-coloured ground. */
  onBrand?: boolean;
};

export function Button({
  label, kind = 'secondary', size = 'regular',
  busy = false, icon, full = false, onBrand = false,
  disabled, style, onPressIn, onPressOut, ...rest
}: Props) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const scale = useSharedValue(1);
  const inactive = disabled || busy;

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const palette = {
    primary: onBrand
      ? { bg: colors.onBrand, border: colors.onBrand, fg: colors.brand }
      : { bg: colors.accent, border: colors.accent, fg: colors.onAccent },
    secondary: onBrand
      ? { bg: 'transparent', border: colors.onBrandMuted, fg: colors.onBrand }
      : { bg: colors.surface, border: colors.lineStrong, fg: colors.ink },
    danger: { bg: colors.surface, border: colors.dangerLine, fg: colors.danger },
    plain: { bg: 'transparent', border: 'transparent', fg: colors.accent },
  }[kind];

  const height = size === 'compact' ? 40 : size === 'large' ? 54 : HIT_SLOP_MIN;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy }}
      disabled={inactive}
      onPressIn={(event) => {
        if (!reduce) scale.value = withSpring(0.97, pressSpring);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, pressSpring);
        onPressOut?.(event);
      }}
      style={[
        animated,
        {
          minHeight: height,
          paddingHorizontal: size === 'compact' ? space.md : space.xl,
          borderRadius: kind === 'plain' ? radius.sm : radius.md,
          borderWidth: kind === 'plain' ? 0 : 1,
          borderColor: palette.border,
          backgroundColor: palette.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: inactive ? 0.5 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        kind === 'primary' ? elevation.raised : elevation.flat,
        style as object,
      ]}
      {...rest}
    >
      {busy ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text
            variant={size === 'compact' ? 'label' : 'bodyStrong'}
            style={{ color: palette.fg }}
          >
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}
