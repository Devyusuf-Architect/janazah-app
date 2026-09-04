// The day heading in a grouped list.
//
// It sticks to the top of the list while its day scrolls past, which is the
// only reason it earns a solid background: a transparent sticky header lets
// rows slide underneath it and reads as a rendering fault.
//
// "Today" gets the accent. Nothing else on the screen does, so the eye finds
// it without reading, which is the whole point of grouping the list in the
// first place.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { space, useColors } from '../../theme';

export function DayHeading({ title }: { title: string }) {
  const colors = useColors();
  const now = title === 'Today';

  return (
    <View
      accessibilityRole="header"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.lg,
        paddingTop: space.lg,
        paddingBottom: space.sm,
        backgroundColor: colors.bg,
      }}
    >
      {now ? (
        <View
          style={{
            width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent,
          }}
        />
      ) : null}
      <Text
        variant="overline"
        style={{
          textTransform: 'uppercase',
          color: now ? colors.accent : colors.ink3,
        }}
      >
        {title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}
