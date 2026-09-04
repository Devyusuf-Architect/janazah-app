// The bottom bar.
//
// Written rather than configured, because the default bar cannot do the two
// things that make navigation feel like an app rather than a website: an
// indicator behind the selected tab, and an icon that answers the press
// before the screen has finished changing.
//
// Both run on the UI thread through Reanimated, so neither competes with the
// list that is about to render. The indicator is a soft pill behind the icon,
// not an underline: an underline at the bottom of the screen sits a couple of
// millimetres from the gesture bar and reads as a rendering artefact.
//
// Reduce motion removes the fade and the press scale, leaving the pill and
// the colour change to say which tab is selected. Nothing about which tab you
// are on depends on having watched an animation.

import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';

import { Text } from './Text';
import { TabIcon, type TabIconName } from './TabIcon';
import {
  useColors, space, radius, type, HIT_SLOP_MIN,
} from '../theme';
import { motion, pressSpring, spring, timing, useReduceMotion } from '../theme/motion';

/** Which glyph belongs to which route. Routes not listed are not in the bar. */
export const TAB_ICONS: Record<string, TabIconName> = {
  index: 'home',
  janazahs: 'notices',
  nearby: 'near',
  following: 'follow',
  profile: 'profile',
};

const BAR_HEIGHT = 60;

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.chrome,
        borderTopWidth: 1,
        borderTopColor: colors.chromeLine,
        paddingTop: space.sm,
        // The gesture bar's inset, plus a little, so the row of labels is not
        // sitting on the swipe area.
        paddingBottom: insets.bottom + (Platform.OS === 'android' ? space.sm : space.xs),
        minHeight: BAR_HEIGHT,
      }}
    >
      {state.routes.map((route, index) => {
        const icon = TAB_ICONS[route.name];
        if (!icon) return null;

        const { options } = descriptors[route.key]!;
        const label = String(options.title ?? route.name);
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress', target: route.key, canPreventDefault: true,
          });
          if (focused || event.defaultPrevented) return;
          navigation.navigate(route.name, route.params);
        };

        return (
          <Tab
            key={route.key}
            icon={icon}
            label={label}
            focused={focused}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            badge={options.tabBarBadge}
          />
        );
      })}
    </View>
  );
}

function Tab({ icon, label, focused, onPress, onLongPress, badge }: {
  icon: TabIconName;
  label: string;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  badge?: number | string;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();

  const press = useSharedValue(1);
  const selected = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    if (reduce) { selected.value = focused ? 1 : 0; return; }
    selected.value = withTiming(focused ? 1 : 0, timing(motion.fast));
  }, [focused, reduce]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  // The pill grows out of nothing rather than sliding between tabs. Sliding
  // needs the bar to know every tab's measured position, which is a layout
  // pass on every render for an effect nobody would name.
  const pillStyle = useAnimatedStyle(() => ({
    opacity: selected.value,
    transform: [{ scale: 0.82 + selected.value * 0.18 }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        if (!reduce) press.value = withSpring(0.9, pressSpring);
      }}
      onPressOut={() => {
        press.value = reduce ? 1 : withSpring(1, spring);
      }}
      style={{
        flex: 1,
        minHeight: HIT_SLOP_MIN,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, iconStyle]}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 46,
              height: 30,
              borderRadius: radius.pill,
              backgroundColor: colors.accentSoft,
            },
            pillStyle,
          ]}
        />
        {/* Above the pill. The pill is absolutely positioned, and a
            positioned box paints over a static sibling regardless of order,
            so the icon needs a stacking context of its own or it disappears
            behind its own indicator. */}
        <View style={{ zIndex: 1 }}>
          <TabIcon
            name={icon}
            color={focused ? colors.accent : colors.ink3}
            focused={focused}
          />
        </View>
        {badge != null ? <Dot /> : null}
      </Animated.View>

      <Text
        numberOfLines={1}
        style={{
          ...type.caption,
          fontWeight: focused ? '600' : '500',
          color: focused ? colors.accent : colors.ink3,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An unread mark, not a count. The number of notices waiting is not a score,
 * and a red numeral on a funeral app is the wrong register entirely.
 */
function Dot() {
  const colors = useColors();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.gold,
        borderWidth: 1.5,
        borderColor: colors.chrome,
      }}
    />
  );
}
