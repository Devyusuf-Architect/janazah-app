// Deleting an account.
//
// Google Play requires this inside the app, not only on a web page, for any
// app that lets people create an account. It is also the honest counterpart
// to having added a /users document at all: anything stored about somebody
// has to be removable by them.
//
// The screen is deliberate about three things:
//
//   It says what deletion does not remove. Notices published by an
//   organization stay, because they are the public record of a funeral and
//   the audit trail has to keep pointing at something.
//
//   It requires a confirmation that is a real decision, not a reflex tap.
//
//   It says plainly that reading notices still works afterwards, because the
//   most likely reason somebody is here is that they no longer want an
//   account rather than that they no longer want the app.

import React, { useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../src/components/Screen';
import { ScreenHeader, PageTitle } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { Button } from '../src/components/Button';
import { Surface } from '../src/components/Surface';
import { Row } from '../src/components/Row';
import { deleteAccount, AccountDeletionError } from '../src/lib/account';
import { signOutGoogle } from '../src/lib/google';
import { useAuth } from '../src/lib/auth';
import { useColors, space } from '../src/theme';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, isAnonymous } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done || !user || isAnonymous) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Account deleted' }} />
        <View
          style={{
            flex: 1, justifyContent: 'center',
            paddingHorizontal: space.lg, gap: space.md,
          }}
        >
          <Text variant="title">
            {done ? 'Your account has been deleted' : 'You are not signed in'}
          </Text>
          {/* The mobile app requires an account, so there is nowhere to go
              back to. Saying "you can still read notices without an account",
              which is what this used to say, is true of the website and no
              longer true here. */}
          <Text variant="body" tone="muted">
            {done
              ? 'Nothing of yours is left on Ta’ziyah. You can read notices '
                + 'at taziyah.com, or make a new account here whenever you '
                + 'want to.'
              : 'There is no account signed in on this phone.'}
          </Text>
          <Button
            label="Done"
            kind="primary"
            onPress={() => router.replace('/(launch)/signin')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Delete account' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Delete my account" />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Surface padded style={{ gap: space.md }}>
            <Text variant="bodyStrong">What is removed</Text>
            <Text variant="callout" tone="muted">
              Your sign-in account, and the record of which masjids you follow
              and your alert preferences. That record is readable only by you,
              and it is deleted before the account itself so that nothing is
              left behind that nobody can reach.
            </Text>
          </Surface>

          <Surface padded style={{ gap: space.md }}>
            <Text variant="bodyStrong">What stays</Text>
            <Text variant="callout" tone="muted">
              Janazah notices published by an organization you were staff of.
              They are the public record of a funeral, and the audit trail of
              who published and corrected them has to keep pointing at
              something. If you own an organization, transfer ownership at
              taziyah.com before deleting this account.
            </Text>
            <Text variant="callout" tone="muted">
              The masjids you follow stay on this phone, so this app keeps
              working exactly as it does now. Reading notices never needed an
              account.
            </Text>
          </Surface>

          <Row
            title="I understand this cannot be undone"
            onPress={() => setConfirmed(!confirmed)}
            leading={(
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: confirmed ? 0 : 1.5,
                  borderColor: colors.lineStrong,
                  backgroundColor: confirmed ? colors.accent : colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {confirmed ? (
                  <Text style={{ color: colors.onAccent, fontWeight: '700' }}>
                    {'✓'}
                  </Text>
                ) : null}
              </View>
            )}
          />

          {error ? <Text variant="callout" tone="danger">{error}</Text> : null}

          <Button
            label="Delete permanently"
            kind="danger"
            full
            busy={busy}
            disabled={!confirmed}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await deleteAccount();
                await signOutGoogle();
                setDone(true);
              } catch (caught) {
                setError(caught instanceof AccountDeletionError
                  ? caught.message
                  : 'The account could not be deleted just now. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </ScreenScroll>
    </Screen>
  );
}
