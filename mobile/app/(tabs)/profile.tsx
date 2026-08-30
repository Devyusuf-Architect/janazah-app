// Profile.
//
// A list, not a settings centre. Phase 1 shows who is signed in and gives a
// way in and out; Phases 4 to 6 fill in preferences, followed masjids, the
// guide and the legal pages.
//
// The sign-in row is honest about what an account is for. Reading notices,
// following a masjid and getting alerts all work signed out on this device;
// an account is what carries those choices to another one.

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Surface, Divider } from '../../src/components/Surface';
import { Button } from '../../src/components/Button';
import { Row } from '../../src/components/Row';
import { useAuth } from '../../src/lib/auth';
import { signOutGoogle } from '../../src/lib/google';
import { space } from '../../src/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, ready, isAnonymous, role, signOut } = useAuth();
  const signedIn = ready && !!user && !isAnonymous;

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.lg }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Text variant="display" serif>Profile</Text>

          <Surface padded style={{ gap: space.md }}>
            {signedIn ? (
              <>
                <Text variant="bodyStrong">
                  {user?.displayName?.trim() || 'Signed in'}
                </Text>
                <Text variant="callout" tone="muted">{user?.email ?? ''}</Text>
                {role.isAdmin ? (
                  <Text variant="caption" tone="subtle">
                    You are a platform administrator. Verification and reports are
                    handled in the console at taziyah.com.
                  </Text>
                ) : null}
                <Button
                  label="Sign out"
                  onPress={async () => { await signOutGoogle(); await signOut(); }}
                />
              </>
            ) : (
              <>
                <Text variant="bodyStrong">You are not signed in</Text>
                <Text variant="callout" tone="muted">
                  Reading notices, following a masjid and turning on alerts all work
                  without an account. Signing in carries those choices to your other
                  devices and to taziyah.com.
                </Text>
                <Button
                  label="Sign in"
                  kind="primary"
                  onPress={() => router.push('/signin')}
                />
              </>
            )}
          </Surface>

          <Surface style={{ overflow: 'hidden' }}>
            <Row title="Notification preferences" note="Phase 5" />
            <Divider inset={space.lg} />
            <Row title="Nearby radius" note="Phase 3" />
            <Divider inset={space.lg} />
            <Row title="Masjids you follow" note="Phase 4" />
            <Divider inset={space.lg} />
            <Row title="Appearance" note="Phase 6" />
          </Surface>

          <Surface style={{ overflow: 'hidden' }}>
            <Row title="How to pray Salat al-Janazah" note="Phase 6" />
            <Divider inset={space.lg} />
            <Row title="About Ta’ziyah" note="Phase 6" />
            <Divider inset={space.lg} />
            <Row title="Privacy" note="Phase 6" />
            <Divider inset={space.lg} />
            <Row title="Terms of service" note="Phase 6" />
          </Surface>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
