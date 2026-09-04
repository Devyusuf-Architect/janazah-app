// The top of Home.
//
// A band of deep green, not a white bar with a title on it. It gives the app
// somewhere to start, it lets the status bar icons go light, and it means the
// first thing on screen is the brand rather than a heading that repeats the
// tab label underneath it.
//
// The band carries three things and stops: who you are, what day it is, and
// the way to Alerts. The search field sits on the fold between the band and
// the page so it reads as belonging to the list rather than to the header.
//
// The status bar is switched to light icons while Home is focused and put
// back on the way out. It is done on focus rather than by rendering a
// <StatusBar> here because every tab stays mounted once visited, so a
// declarative status bar in one tab would keep applying from inside another.

import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarStyle } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { useAuth } from '../../lib/auth';
import { useColors, useTheme, radius, space, HIT_SLOP_MIN } from '../../theme';

/** First name only. A full legal name in a greeting is not a greeting. */
function firstName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function today(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(now);
  } catch {
    return now.toDateString();
  }
}

export function HomeHeader({ children }: { children?: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const { user, ready } = useAuth();

  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme]));

  const name = ready && user && !user.isAnonymous
    ? firstName(user.displayName)
    : null;

  return (
    <View
      style={{
        backgroundColor: colors.brand,
        paddingTop: insets.top + space.lg,
        paddingHorizontal: space.lg,
        paddingBottom: space.lg,
        borderBottomLeftRadius: radius.xl,
        borderBottomRightRadius: radius.xl,
        gap: space.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" style={{ color: colors.onBrandMuted }}>
            {today(new Date())}
          </Text>
          <Text variant="title" serif style={{ color: colors.onBrand }}>
            {/* The salaam is used only when there is a name to attach it to.
                Greeting somebody by no name reads as a template. */}
            {name ? `Assalamu Alaikum, ${name}` : 'Assalamu Alaikum'}
          </Text>
        </View>
        <BellButton />
      </View>
      {children}
    </View>
  );
}

function BellButton() {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Alerts"
      accessibilityHint="Choose what reaches this phone"
      onPress={() => router.push('/alerts')}
      hitSlop={10}
      style={({ pressed }) => ({
        width: HIT_SLOP_MIN - 8,
        height: HIT_SLOP_MIN - 8,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.brandDeep : 'transparent',
        borderWidth: 1,
        borderColor: colors.brandDeep,
      })}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.4 1.2 4.8 1.7 5.4a.6.6 0 0 1-.4 1H5.2a.6.6 0 0 1-.4-1c.5-.6 1.7-2 1.7-5.4z"
          stroke={colors.onBrand} strokeWidth={1.7}
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <Path
          d="M10.2 19.2a2 2 0 0 0 3.6 0"
          stroke={colors.onBrand} strokeWidth={1.7} strokeLinecap="round" fill="none"
        />
      </Svg>
    </Pressable>
  );
}
