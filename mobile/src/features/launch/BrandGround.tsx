// The deep green ground the launch screens sit on.
//
// One component so the splash, onboarding and sign-in are unmistakably the
// same surface, and so the motif appears in exactly three places and nowhere
// else. Once somebody is inside the app the ground becomes parchment and the
// pattern is gone: ornament belongs to the door, not to the room where
// somebody is reading when a funeral is.
//
// No gradient. A flat deep green with a slightly deeper band behind the
// content reads as considered; a gradient reads as a template.

import React from 'react';
import { View, type ViewProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { Pattern } from '../../components/Pattern';
import { useColors } from '../../theme';

export function BrandGround({ children, style, ...rest }: ViewProps) {
  const colors = useColors();

  return (
    <View
      {...rest}
      style={[{ flex: 1, backgroundColor: colors.brand }, style]}
    >
      {/* The launch screens are always dark, whatever the system scheme, so
          the status bar is pinned light rather than following the theme. */}
      <StatusBar style="light" />
      <Pattern color={colors.onBrand} opacity={0.05} />
      {children}
    </View>
  );
}
