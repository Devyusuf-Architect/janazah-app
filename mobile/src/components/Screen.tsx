// The page frame every screen sits in.
//
// Handles the ground colour, the status bar, and the safe areas. Bottom inset
// is left to the tab bar, so a scroll view can run under it rather than
// stopping short and leaving a stripe of background.

import React from 'react';
import { View, ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, space } from '@/theme';

export function Screen({
  children, sunk = false,
}: { children: React.ReactNode; sunk?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: sunk ? colors.bgSunk : colors.bg }}>
      {children}
    </View>
  );
}

export function ScreenScroll({
  children, contentContainerStyle, ...rest
}: ScrollViewProps & { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        { paddingBottom: insets.bottom + space.xxl },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
