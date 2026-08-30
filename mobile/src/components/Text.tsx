// Typography.
//
// One component, one `variant` prop, and no ad-hoc font sizes anywhere else
// in the app. Text scaling is left on everywhere by default: someone reading
// a funeral notice with the system font size turned up must get the larger
// text, so `allowFontScaling` is never set to false, and the line heights in
// tokens.ts are chosen to survive it.

import React from 'react';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useColors, type } from '../theme';

export type TextVariant = keyof typeof type;
export type TextTone = 'default' | 'muted' | 'subtle' | 'accent' | 'danger' | 'onAccent';

type Props = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  /**
   * The brand serif. Reserved for the name of a person who has died and for
   * screen titles. Body text in the serif would make this look like the
   * website rendered small.
   */
  serif?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'default',
  serif = false,
  style,
  ...rest
}: Props) {
  const colors = useColors();

  const color = {
    default: colors.ink,
    muted: colors.ink2,
    subtle: colors.ink3,
    accent: colors.accent,
    danger: colors.danger,
    onAccent: colors.onAccent,
  }[tone];

  const base = type[variant] as TextStyle;

  return (
    <RNText
      {...rest}
      style={[
        base,
        { color },
        serif ? { fontFamily: 'serif' } : null,
        style,
      ]}
    />
  );
}
