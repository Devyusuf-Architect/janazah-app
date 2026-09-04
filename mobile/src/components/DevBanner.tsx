// Which backend this build is talking to.
//
// Development builds default to the local Firebase emulators, which is the
// native counterpart of the web app's behaviour on localhost. That is the
// right default and it has one bad failure mode: if the emulators are not
// running, the app signs in nowhere and shows no notices, and there is
// nothing on screen to say why. It looks exactly like a broken app talking to
// a broken backend.
//
// So it says so. A strip at the top, in development only, naming the backend
// and the host. When it says "Live project" everything on screen came from
// Firestore over the network.
//
// It never ships. The whole component returns null when __DEV__ is false, and
// Metro's minifier drops a branch behind a false constant, so a release build
// carries neither the strip nor its strings. test/design.test.ts checks that
// the guard is still there.
//
// Tapping it hides it for the rest of the session, because it sits over the
// status bar and somebody screenshotting a screen should be able to get rid
// of it.

import React, { useState } from 'react';
import { Platform, Pressable, StatusBar as RNStatusBar, View } from 'react-native';

import { Text } from './Text';
import { usingEmulator, emulatorHost } from '../lib/firebase';
import { useColors, space } from '../theme';

export function DevBanner() {
  const colors = useColors();
  const [hidden, setHidden] = useState(false);

  // The one guard that matters. Everything below is development-only.
  if (!__DEV__ || hidden) return null;

  const live = !usingEmulator;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={live
        ? 'Development build, connected to the live Firebase project. Tap to hide.'
        : `Development build, connected to the Firebase emulators at ${emulatorHost}, `
          + 'not to the live project. Set EXPO_PUBLIC_USE_LIVE=1 for live data. Tap to hide.'}
      onPress={() => setHidden(true)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingTop: (Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0) + 2,
        paddingBottom: 3,
        paddingHorizontal: space.md,
        alignItems: 'center',
        backgroundColor: live ? colors.accent : colors.gold,
      }}
    >
      <Text
        numberOfLines={1}
        // onAccent on accent, and goldSoft on gold. Both pairs invert with
        // the scheme, so the strip stays readable in either.
        style={{
          fontSize: 11,
          lineHeight: 14,
          fontWeight: '700',
          color: live ? colors.onAccent : colors.goldSoft,
        }}
      >
        {live
          ? 'DEV BUILD · live Firebase project'
          : `DEV BUILD · emulators at ${emulatorHost} · not live data`}
      </Text>
    </Pressable>
  );
}
