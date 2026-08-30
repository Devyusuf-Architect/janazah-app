// A labelled text input.
//
// The label is a real <Text> above the field rather than a placeholder.
// A placeholder-as-label disappears the moment somebody starts typing, which
// is exactly when they are most likely to want to check what the field was
// for, and screen readers handle it inconsistently.

import React, { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './Text';
import { useColors, radius, space, type, HIT_SLOP_MIN } from '../theme';

type Props = TextInputProps & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, style, ...rest }: Props) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label" tone="muted">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.ink3}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            minHeight: HIT_SLOP_MIN,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: focused ? colors.accent : colors.line,
            backgroundColor: colors.surface,
            color: colors.ink,
            fontSize: type.body.fontSize,
          },
          style,
        ]}
        {...rest}
      />
      {hint ? <Text variant="caption" tone="subtle">{hint}</Text> : null}
    </View>
  );
}
