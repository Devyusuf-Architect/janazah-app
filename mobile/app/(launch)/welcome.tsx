// The welcome.
//
// Three panels. Not ten, and not a carousel of feature screenshots: what
// somebody needs before they are asked for two permissions and an account is
// what this app is for, what it will tell them, and what it will not do with
// their location. That is three things, so it is three panels.
//
// Every one of them can be skipped from the first screen. Somebody who has
// been sent here by a funeral notice should be able to get to it.
//
// The permissions themselves are NOT requested here. The third panel explains
// them and the app asks later, at the moment each one is first useful: location
// when Nearby is opened, notifications when alerts are turned on. Asking on an
// onboarding screen is how an app spends the one prompt Android grants it
// before anybody has a reason to say yes.

import React, { useRef, useState } from 'react';
import {
  Dimensions, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { BrandGround } from '../../src/features/launch/BrandGround';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { markOnboarded } from '../../src/features/launch/onboarding-state';
import { useColors, space } from '../../src/theme';
import { motion, spring, timing, useReduceMotion } from '../../src/theme/motion';

const { width } = Dimensions.get('window');

type Panel = {
  key: string;
  title: string;
  body: string;
  icon: 'notice' | 'bell' | 'shield';
};

const PANELS: Panel[] = [
  {
    key: 'find',
    title: 'Janazah notices you can trust',
    body: 'Masjids and funeral coordinators verified by a Ta’ziyah '
      + 'administrator publish here. You see the time, the place, and how to '
      + 'get there, without hunting through group chats.',
    icon: 'notice',
  },
  {
    key: 'know',
    title: 'Know in time to attend',
    body: 'Follow the masjids that matter to you and hear when they announce '
      + 'a Janazah, when a time or place changes, and when one is cancelled. '
      + 'We will ask permission for this later, when you turn it on.',
    icon: 'bell',
  },
  {
    key: 'private',
    title: 'Your location stays on your phone',
    body: 'Ta’ziyah can show which Janazahs are near you. That is worked out '
      + 'on this device. Your location is never sent to us, to any masjid, or '
      + 'to anyone else, and nothing records where you have been.',
    icon: 'shield',
  },
];

export default function WelcomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const last = index === PANELS.length - 1;

  const advance = async () => {
    if (last) {
      await markOnboarded();
      router.replace('/(launch)/signin');
      return;
    }
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: !reduce });
  };

  const skip = async () => {
    await markOnboarded();
    router.replace('/(launch)/signin');
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  return (
    <BrandGround>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          paddingTop: insets.top + space.sm,
          paddingHorizontal: space.lg,
        }}
      >
        <Button
          label="Skip"
          kind="plain"
          size="compact"
          onPress={skip}
          style={{ paddingHorizontal: space.sm }}
        />
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {PANELS.map((panel) => (
          <View
            key={panel.key}
            style={{
              width,
              paddingHorizontal: space.xl,
              justifyContent: 'center',
              gap: space.xl,
            }}
          >
            <PanelIcon name={panel.icon} color={colors.onBrand} />
            <View style={{ gap: space.md }}>
              <Text
                variant="hero"
                serif
                style={{ color: colors.onBrand }}
              >
                {panel.title}
              </Text>
              <Text
                variant="body"
                style={{ color: colors.onBrandMuted, lineHeight: 25 }}
              >
                {panel.body}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: space.xl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.xl,
        }}
      >
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${index + 1} of ${PANELS.length}`}
          style={{ flexDirection: 'row', gap: space.sm }}
        >
          {PANELS.map((panel, i) => (
            <Dot key={panel.key} active={i === index} />
          ))}
        </View>

        <Button
          label={last ? 'Get started' : 'Next'}
          kind="primary"
          size="large"
          onBrand
          full
          onPress={advance}
        />
      </View>
    </BrandGround>
  );
}

/** The page indicator. The active one widens rather than changing colour. */
function Dot({ active }: { active: boolean }) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const width_ = useSharedValue(active ? 26 : 8);
  const opacity = useSharedValue(active ? 1 : 0.4);

  React.useEffect(() => {
    if (reduce) {
      width_.value = active ? 26 : 8;
      opacity.value = active ? 1 : 0.4;
      return;
    }
    width_.value = withSpring(active ? 26 : 8, spring);
    opacity.value = withTiming(active ? 1 : 0.4, timing(motion.fast));
  }, [active, reduce]);

  const style = useAnimatedStyle(() => ({
    width: width_.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { height: 8, borderRadius: 4, backgroundColor: colors.onBrand },
        style,
      ]}
    />
  );
}

/** Line art rather than an illustration. It has to read at a glance. */
function PanelIcon({ name, color }: { name: Panel['icon']; color: string }) {
  const common = {
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
    opacity: 0.9,
  };

  return (
    <Svg width={64} height={64} viewBox="0 0 48 48">
      {name === 'notice' ? (
        <>
          <Path d="M10 8h20l8 8v24a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" {...common} />
          <Path d="M30 8v8h8" {...common} />
          <Path d="M15 24h18M15 31h12" {...common} />
        </>
      ) : null}
      {name === 'bell' ? (
        <>
          <Path d="M14 21a10 10 0 0 1 20 0c0 6 2 8.5 3 9.6a1 1 0 0 1-.7 1.7H11.7a1 1 0 0 1-.7-1.7C12 29.5 14 27 14 21z" {...common} />
          <Path d="M20 36.5a4.4 4.4 0 0 0 8 0" {...common} />
        </>
      ) : null}
      {name === 'shield' ? (
        <>
          <Path d="M24 6l14 5v12c0 9-6 15.5-14 19-8-3.5-14-10-14-19V11z" {...common} />
          <Circle cx="24" cy="22" r="3.4" {...common} />
          <Path d="M24 25.4V31" {...common} />
        </>
      ) : null}
    </Svg>
  );
}
