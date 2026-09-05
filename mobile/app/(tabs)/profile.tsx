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
import { PageTitle } from '../../src/components/ScreenHeader';
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
import { useMyOrganizations } from '../../src/lib/queries';
import { useTheme, space } from '../../src/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, ready, isAnonymous, role, signOut } = useAuth();
  const follows = useFollows();
  const location = useLocation();
  const { choice } = useTheme();
  const orgs = useMyOrganizations(
    user && !isAnonymous ? user.uid : undefined,
  ).data ?? [];
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const signedIn = ready && !!user && !isAnonymous;
  const radiusLabel = RADIUS_OPTIONS
    .find((o) => o.km === location.prefs.radiusKm)?.label ?? '';
  const themeLabel = { system: 'Match my phone', light: 'Light', dark: 'Dark' }[choice];

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.lg }}>
        <PageTitle title="Profile" />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>

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
              // The mobile app requires an account, so this branch is only
              // ever the half-second between tapping sign out and the gate
              // moving the app back to the door. It is deliberately not an
              // invitation to browse signed out.
              <>
                <Text variant="bodyStrong">Signing out</Text>
                <Text variant="callout" tone="muted">
                  One moment.
                </Text>
              </>
            )}
          </Surface>

          {orgs.length ? (
            <Surface style={{ overflow: 'hidden' }}>
              {/* Coordinators reach their masjid from Home and from here.
                  Both, because Home's card scrolls away behind a busy feed
                  and Profile is where somebody looks for the thing that
                  belongs to them. Not a sixth tab. */}
              {orgs.map((org, index) => (
                <View key={org.id}>
                  {index > 0 ? <Divider inset={space.lg} /> : null}
                  <Row
                    title={org.name}
                    subtitle={org.verificationStatus === 'verified'
                      ? 'Your masjid. Publish at taziyah.com.'
                      : 'Your masjid. Awaiting verification.'}
                    onPress={() => router.push(`/o/${org.id}`)}
                  />
                </View>
              ))}
            </Surface>
          ) : null}

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
              onPress={() => router.push('/(tabs)/nearby')}
            />
            <Divider inset={space.lg} />
            <Row
              title="Masjids you follow"
              note={follows.ids.length ? String(follows.ids.length) : 'None yet'}
              onPress={() => router.push(follows.ids.length ? '/(tabs)/following' : '/masjids')}
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
                subtitle="Permanent. Ta’ziyah keeps nothing of yours afterwards."
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
