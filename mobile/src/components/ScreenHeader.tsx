// A screen header with a back arrow.
//
// The stack's own header was turned off across the app, and the replacement
// until now was a button labelled "Back" sitting in the content. That works
// and looks like a form. This is the same thing shaped like a phone: a
// chevron in a circular target on the left, a title that can shrink, and room
// for one action on the right.
//
// The title in the row is optional and usually left out, because the screen's
// own large title sits just underneath it. PageTitle below is that title, and
// pairing the two is the standard shape for every screen in the app that is
// not a tab root: a chevron row, then a serif heading, then the content.
//
// On a notice both are left out. The screen's own heading is the time, and
// repeating "Janazah notice" above it costs a line at the top of the most
// important screen in the app.

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Text } from './Text';
import { useColors, radius, space, HIT_SLOP_MIN } from '../theme';

export function ScreenHeader({ title, onBrand = false, right }: {
  title?: string;
  /** For a header sitting on the deep green ground. */
  onBrand?: boolean;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const fg = onBrand ? colors.onBrand : colors.ink;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingTop: insets.top + space.sm,
        paddingHorizontal: space.md,
        paddingBottom: space.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        // Falls back to Home rather than to nothing: this screen is the
        // target of an App Link and of a notification tap, so it is often the
        // first thing in the stack and there is nowhere to go back to.
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={({ pressed }) => ({
          width: HIT_SLOP_MIN,
          height: HIT_SLOP_MIN,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed
            ? (onBrand ? colors.brandDeep : colors.pressed)
            : 'transparent',
        })}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path
            d="M15 5 8 12l7 7"
            stroke={fg} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
        </Svg>
      </Pressable>

      <View style={{ flex: 1 }}>
        {title ? (
          <Text variant="heading" numberOfLines={1} style={{ color: fg }}>
            {title}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

/**
 * The large title under a header.
 *
 * Serif, because that is the brand voice and because a screen title is one of
 * the three things the type scale reserves it for. The optional line under it
 * is for a screen that needs a sentence of explanation, which several of them
 * do: what the masjid directory contains, what the alerts screen will send.
 */
export function PageTitle({ title, subtitle, right }: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingBottom: space.md,
        gap: space.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text
          accessibilityRole="header"
          variant="display"
          serif
          style={{ flex: 1 }}
        >
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text variant="callout" tone="muted">{subtitle}</Text>
      ) : null}
    </View>
  );
}

/** An icon-only action for the right of a header. */
export function HeaderAction({ label, onPress, onBrand = false, children }: {
  label: string;
  onPress: () => void;
  onBrand?: boolean;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: HIT_SLOP_MIN,
        height: HIT_SLOP_MIN,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed
          ? (onBrand ? colors.brandDeep : colors.pressed)
          : 'transparent',
      })}
    >
      {children}
    </Pressable>
  );
}
