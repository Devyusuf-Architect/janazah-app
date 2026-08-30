// Profile.
//
// A list, not a settings centre. Everything on it is either an account fact,
// one preference, or a link to somewhere that explains something.
//
// The one thing this screen is careful about is saying which choices travel
// with an account and which belong to this phone. Somebody who turns
// notifications on here and then signs in on a laptop should not be surprised
// either way, and the only way to avoid that is to say so where the choice is
// made.

import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Surface, Divider } from '../../src/components/Surface';
import { Button } from '../../src/components/Button';
import { Row } from '../../src/components/Row';
import { AppearanceSheet } from '../../src/features/profile/AppearanceSheet';
import { useFollows } from '../../src/features/following/useFollows';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useAuth } from '../../src/lib/auth';
import { signOutGoogle } from '../../src/lib/google';
import { RADIUS_OPTIONS } from '../../src/lib/nearby';
import { useTheme, space } from '../../src/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, ready, isAnonymous, role, signOut } = useAuth();
  const follows = useFollows();
  const location = useLocation();
  const { choice } = useTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const signedIn = ready && !!user && !isAnonymous;
  const radiusLabel = RADIUS_OPTIONS
    .find((o) => o.km === location.prefs.radiusKm)?.label ?? '';
  const themeLabel = { system: 'Match my phone', light: 'Light', dark: 'Dark' }[choice];

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
                {user?.email ? (
                  <Text variant="callout" tone="muted">{user.email}</Text>
                ) : null}
                {role.isAdmin ? (
                  <Text variant="caption" tone="subtle">
                    You are a platform administrator. Verification and reports
                    are handled in the console at taziyah.com.
                  </Text>
                ) : null}
                <Text variant="caption" tone="subtle">
                  The masjids you follow and your alert preferences are saved to
                  this account and reach your other devices. Your appearance
                  choice, this phone’s notification and location permissions,
                  and any reminders you set stay on this phone.
                </Text>
                <Button
                  label="Sign out"
                  onPress={async () => { await signOutGoogle(); await signOut(); }}
                />
              </>
            ) : (
              <>
                <Text variant="bodyStrong">You are not signed in</Text>
                <Text variant="callout" tone="muted">
                  Reading notices, following a masjid and turning on alerts all
                  work without an account. Signing in carries the masjids you
                  follow and your alert preferences to your other devices and to
                  taziyah.com.
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
            <Row
              title="Alerts"
              subtitle="What reaches this phone, and from where"
              onPress={() => router.push('/alerts')}
            />
            <Divider inset={space.lg} />
            <Row
              title="Nearby"
              note={location.point ? radiusLabel : 'Off'}
              subtitle={location.point
                ? 'Distances are worked out on this phone'
                : 'Location is off'}
              onPress={() => router.push('/nearby')}
            />
            <Divider inset={space.lg} />
            <Row
              title="Masjids you follow"
              note={follows.ids.length ? String(follows.ids.length) : 'None yet'}
              onPress={() => router.push(follows.ids.length ? '/following' : '/masjids')}
            />
            <Divider inset={space.lg} />
            <Row
              title="Appearance"
              note={themeLabel}
              subtitle="This phone only"
              onPress={() => setAppearanceOpen(true)}
            />
          </Surface>

          <Surface style={{ overflow: 'hidden' }}>
            <Row
              title="How to pray Salat al-Janazah"
              subtitle="A reminder, with each text’s source"
              onPress={() => router.push('/guide')}
            />
            <Divider inset={space.lg} />
            <Row
              title="About Ta’ziyah"
              subtitle="What this app does with your phone, privacy and terms"
              onPress={() => router.push('/about')}
            />
          </Surface>

          {signedIn ? (
            <Surface style={{ overflow: 'hidden' }}>
              <Row
                title="Delete my account"
                subtitle="Permanent. You can still read notices afterwards."
                onPress={() => router.push('/delete-account')}
              />
            </Surface>
          ) : null}
        </View>
      </ScreenScroll>

      <AppearanceSheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
      />
    </Screen>
  );
}
