// About, and how this phone is used.
//
// The full privacy policy and the terms of service live at taziyah.com and
// are opened there rather than copied here. That is not laziness: they are
// the documents the platform is accountable for, and a second copy in an app
// binary would drift from them the first time either is amended, with no way
// to correct the copies already installed.
//
// What this screen does carry is the part the web policy cannot: what the
// Android app specifically does with this phone. The permissions, where the
// position is kept, what a notification subscription actually is, and what
// leaves the device and what does not. Somebody deciding whether to grant a
// permission needs that here, at the moment they are deciding, not behind a
// link.

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';

import { Screen, ScreenScroll } from '../src/components/Screen';
import { ScreenHeader, PageTitle } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { Surface, Divider } from '../src/components/Surface';
import { Row } from '../src/components/Row';
import { space } from '../src/theme';

const SITE = String(Constants.expoConfig?.extra?.siteOrigin ?? 'https://taziyah.com');

/**
 * Opened in the system browser rather than an in-app view.
 *
 * A policy shown inside the app it describes is a policy the app could in
 * principle have altered. The address bar is the point.
 */
const open = (path: string) =>
  WebBrowser.openBrowserAsync(`${SITE}${path}`).catch(() => {});

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <Stack.Screen options={{ title: 'About' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Ta’ziyah" />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <Text variant="body" tone="muted">
              Janazah information is scattered across group chats, masjid
              announcements and word of mouth. People miss funerals they would
              have attended, sometimes while standing a few streets away,
              because they never heard in time.
            </Text>
            <Text variant="body" tone="muted">
              This is one place where masjids and funeral coordinators verified
              by a Ta’ziyah administrator publish Janazah notices, and where
              you can find out in time to attend.
            </Text>
          </View>

          <Section title="What the verified badge means">
            <Text variant="body" tone="muted">
              An administrator confirmed that the organization is real and that
              the person registering it speaks for it, before it could publish
              anything at all. The badge is about the masjid. It does not mean
              anyone checked a particular notice, and if a time or place looks
              wrong you should report it rather than rely on it.
            </Text>
          </Section>

          <Section title="What this app does with your phone">
            <Surface style={{ overflow: 'hidden' }}>
              <Fact
                title="Your location"
                body={
                  'Used only on this phone, to work out which Janazahs are near '
                  + 'you. It is never sent to us, to a masjid, or to anyone '
                  + 'else. Only your most recent position is stored, encrypted '
                  + 'on this device, and turning location off erases it. '
                  + 'Nothing anywhere records where you have been.'
                }
              />
              <Divider inset={space.lg} />
              <Fact
                title="Notifications"
                body={
                  'Your phone asks to be told about areas, not the other way '
                  + 'round. It works out which areas cover the distance you '
                  + 'chose and subscribes to them; an area is several '
                  + 'kilometres across. The request is acted on and discarded, '
                  + 'so there is no way for us to ask which phones are in a '
                  + 'place.'
                }
              />
              <Divider inset={space.lg} />
              <Fact
                title="Reminders"
                body={
                  'Scheduled on this phone and nowhere else. A list of '
                  + 'reminders held by us would be a record of which funerals '
                  + 'you intend to attend, so there is not one.'
                }
              />
              <Divider inset={space.lg} />
              <Fact
                title="Your account"
                body={
                  'If you sign in, the masjids you follow and your alert '
                  + 'preferences are saved to your account so they reach your '
                  + 'other devices. Nothing else is. Nobody else can read them, '
                  + 'including Ta’ziyah administrators.'
                }
              />
              <Divider inset={space.lg} />
              <Fact
                title="Reading needs no account"
                body={
                  'Notices, following a masjid and alerts all work without one. '
                  + 'An account only carries your choices between devices.'
                }
              />
            </Surface>
          </Section>

          <Section title="The full documents">
            <Surface style={{ overflow: 'hidden' }}>
              <Row
                title="How your information is handled"
                subtitle="The privacy policy, at taziyah.com"
                onPress={() => open('/privacy')}
              />
              <Divider inset={space.lg} />
              <Row
                title="Terms of service"
                subtitle="Who may publish, and what happens when a notice is wrong"
                onPress={() => open('/terms')}
              />
              <Divider inset={space.lg} />
              <Row
                title="Asking for a notice to be taken down"
                subtitle="If you are family and want one removed sooner"
                onPress={() => open('/privacy')}
              />
            </Surface>
          </Section>

          <Section title="Not a religious authority">
            <Text variant="body" tone="muted">
              Ta’ziyah is a notification service. The Janazah guide in this app
              is offered as a reminder, with each text’s source given so it can
              be checked, and it says plainly where the schools of law differ.
              Follow your local imam.
            </Text>
          </Section>

          {version ? (
            <Text variant="caption" tone="subtle">{`Version ${version}`}</Text>
          ) : null}
        </View>
      </ScreenScroll>
    </Screen>
  );
}

function Section({ title, children }: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space.md, paddingTop: space.sm }}>
      <Text
        variant="overline"
        tone="subtle"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase' }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ padding: space.lg, gap: space.xs }}>
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="callout" tone="muted">{body}</Text>
    </View>
  );
}
