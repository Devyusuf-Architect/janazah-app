// A raised area.
//
// Three levels, matching the elevation tokens. `sunk` is a recessed ground for
// grouping; `flat` is the default card; `raised` is for the one thing on a
// screen the eye should land on first. Only `raised` carries a shadow, because
// a shadow under every card is what makes an interface look busy rather than
// deep.

import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useColors, radius, space, elevation } from '../theme';

type Props = ViewProps & {
  level?: 'sunk' | 'flat' | 'raised';
  padded?: boolean | 'tight';
  /** Corner radius. `lg` is the default card; `xl` is a hero panel. */
  round?: keyof typeof radius;
};

export function Surface({
  level = 'flat', padded = false, round = 'lg', style, ...rest
}: Props) {
  const colors = useColors();

  const background = {
    sunk: colors.bgSunk,
    flat: colors.surface,
    raised: colors.surface,
  }[level];

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: background,
          borderRadius: radius[round],
          borderWidth: level === 'sunk' ? 0 : 1,
          borderColor: colors.line,
        },
        level === 'raised' ? elevation.raised : elevation.flat,
        padded ? { padding: padded === 'tight' ? space.md : space.lg } : null,
        style,
      ]}
    />
  );
}

/** A hairline between rows in a list. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const colors = useColors();
  return (
    <View style={{ height: 1, marginLeft: inset, backgroundColor: colors.line }} />
  );
}
