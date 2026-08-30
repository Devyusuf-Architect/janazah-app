// A raised area: a hairline border and a tint, never a drop shadow.
//
// Shadows on every row are what make an app look like a web page of cards.
// A border reads as a boundary at arm's length, renders identically across
// Android versions, and costs nothing.

import React from 'react';
import { View, type ViewProps } from 'react-native';

import { useColors, radius, space } from '@/theme';

type Props = ViewProps & {
  /** 'flat' sits on the page ground; 'raised' is the default panel. */
  level?: 'flat' | 'raised';
  padded?: boolean;
};

export function Surface({
  level = 'raised', padded = false, style, ...rest
}: Props) {
  const colors = useColors();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: level === 'raised' ? colors.surface : colors.bgSunk,
          borderRadius: radius.lg,
          borderWidth: level === 'raised' ? 1 : 0,
          borderColor: colors.line,
        },
        padded ? { padding: space.lg } : null,
        style,
      ]}
    />
  );
}

/** A full-width hairline between rows in a list. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const colors = useColors();
  return (
    <View
      style={{ height: 1, marginLeft: inset, backgroundColor: colors.line }}
    />
  );
}
