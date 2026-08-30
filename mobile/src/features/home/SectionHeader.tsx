// A section heading in a scrolling list.
//
// Small caps rather than a large title. The web home page can afford a heading
// per section; on a phone those headings become most of the first screen and
// push the thing somebody opened the app for below the fold.

import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { space, useColors } from '../../theme';

export function SectionHeader({ title, action }: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();

  return (
    <View
      accessibilityRole="header"
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: space.lg,
        paddingTop: space.xl,
      }}
    >
      <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${action.label}, ${title}`}
          onPress={action.onPress}
          hitSlop={12}
        >
          <Text variant="label" style={{ color: colors.accent }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
