// Buttons.
//
// Three kinds and no more: the one action that matters on a screen (primary),
// everything else (secondary), and something destructive. Every one of them
// is at least 48dp tall, which is Android's minimum target and not negotiable
// for an app whose readers are often older and often in a hurry.

import React from 'react';
import {
  ActivityIndicator, Pressable, View, type PressableProps,
} from 'react-native';

import { useColors, radius, space, HIT_SLOP_MIN } from '../theme';
import { Text } from './Text';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  kind?: 'primary' | 'secondary' | 'danger';
  size?: 'regular' | 'compact';
  busy?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
};

export function Button({
  label, kind = 'secondary', size = 'regular',
  busy = false, icon, full = false, disabled, style, ...rest
}: Props) {
  const colors = useColors();
  const inactive = disabled || busy;

  const palette = {
    primary: { bg: colors.accent, border: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.surface, border: colors.lineStrong, fg: colors.ink },
    danger: { bg: colors.surface, border: colors.dangerLine, fg: colors.danger },
  }[kind];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy }}
      disabled={inactive}
      style={({ pressed }) => [
        {
          minHeight: size === 'compact' ? 40 : HIT_SLOP_MIN,
          paddingHorizontal: size === 'compact' ? space.md : space.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: inactive ? 0.55 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        pressed && !inactive
          ? { backgroundColor: kind === 'primary' ? colors.accentPressed : colors.pressed }
          : null,
        style as object,
      ]}
      {...rest}
    >
      {busy
        ? <ActivityIndicator size="small" color={palette.fg} />
        : (
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
    </Pressable>
  );
}
