// A list row.
//
// The most repeated element in the app, so it carries the accessibility
// contract rather than leaving it to each caller: the whole row is one target,
// it is at least 48dp tall, and its label is the title plus whatever secondary
// text is showing, read as one phrase rather than as three separate items.

import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from './Text';
import { useColors, space, HIT_SLOP_MIN } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Right-hand text: a distance, a time, a state. */
  note?: string;
  onPress?: () => void;
  leading?: React.ReactNode;
};

export function Row({ title, subtitle, note, onPress, leading }: Props) {
  const colors = useColors();
  const label = [title, subtitle, note].filter(Boolean).join(', ');

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: HIT_SLOP_MIN,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
      }}
    >
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">{subtitle}</Text>
        ) : null}
      </View>
      {note ? <Text variant="caption" tone="subtle">{note}</Text> : null}
      {onPress ? (
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path
            d="m9 5 7 7-7 7"
            stroke={colors.ink3} strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        </Svg>
      ) : null}
    </View>
  );

  if (!onPress) {
    return <View accessible accessibilityLabel={label}>{body}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.pressed : 'transparent',
      })}
    >
      {body}
    </Pressable>
  );
}
