// A collapsed explanation.
//
// For text that has to be somewhere and must not be the first thing on the
// screen: what the verified mark actually means, how location works, what a
// setting does. Every one of those matters and none of them is what somebody
// opened the app for.
//
// It is a link with a chevron rather than a card with a border, because it is
// one line most of the time and a bordered box around one line is how a
// screen turns into a stack of panels.
//
// It expands in place with LayoutAnimation and does nothing at all under
// reduce motion, in which case the content simply appears.

import React, { useState } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from './Text';
import { useColors, radius, space, HIT_SLOP_MIN } from '../theme';
import { motion, useReduceMotion } from '../theme/motion';

export function Disclosure({ label, children }: {
  label: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
        onPress={() => {
          if (!reduce) {
            LayoutAnimation.configureNext({
              duration: motion.fast,
              update: { type: LayoutAnimation.Types.easeInEaseOut },
              create: {
                type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity',
              },
              delete: {
                type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity',
              },
            });
          }
          setOpen((current) => !current);
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: HIT_SLOP_MIN - 8,
          borderRadius: radius.sm,
          backgroundColor: pressed ? colors.pressed : 'transparent',
        })}
      >
        <Text variant="label" style={{ color: colors.accent, flex: 1 }}>
          {label}
        </Text>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path
            d={open ? 'm6 14.5 6-6 6 6' : 'm6 9.5 6 6 6-6'}
            stroke={colors.accent} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        </Svg>
      </Pressable>

      {open ? (
        <View style={{ paddingTop: space.sm, gap: space.sm }}>{children}</View>
      ) : null}
    </View>
  );
}
