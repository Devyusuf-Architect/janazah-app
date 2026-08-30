// A design harness.
//
// Renders the app's presentational components against fixed sample data, in a
// browser, at phone width, so the design can be looked at and screenshotted
// without an Android device. It is not the app: nothing here touches
// Firebase, navigation or location, and it is never shipped.
//
// It exists because the parts of this project most likely to be wrong are the
// ones a type checker cannot see. Whether a row is scannable, whether the
// cancellation reads before the time, and whether the whole thing survives a
// large font size are questions you have to look at.
//
//   node preview/build.mjs && open preview/out/index.html

import React from 'react';
import { createRoot } from 'react-dom/client';
import { View, ScrollView } from 'react-native';

import { ThemeProvider, useColors, space } from '../src/theme';
import { AuthProvider } from '../src/lib/auth';
import { FollowsProvider } from '../src/features/following/useFollows';
import { LocationProvider } from '../src/features/nearby/useLocation';
import { Text } from '../src/components/Text';
import { Button } from '../src/components/Button';
import { Surface, Divider } from '../src/components/Surface';
import { Badge, VerifiedBadge } from '../src/components/Badge';
import { Row } from '../src/components/Row';
import { Empty, ErrorState, StaleBanner, Loading } from '../src/components/States';
import { Field } from '../src/components/Field';
import { NoticeRow } from '../src/features/notices/NoticeRow';
import { NoticeDetail } from '../src/features/notices/NoticeDetail';
import { LocationGate } from '../src/features/nearby/LocationGate';
import { GuideBody } from '../src/features/guide/GuideBody';
import { ViewToggle } from '../src/features/nearby/ViewToggle';
import type { Notice } from '../src/lib/notice';

const hours = (n: number) => new Date(Date.now() + n * 3600_000);

/**
 * Fictional, in the same way public/js/sample-data.js is fictional and for
 * the same reason: "Fulan ibn Fulan" is the Arabic equivalent of John Doe, so
 * the audience reads it as a placeholder at a glance, and no real institution
 * appears announcing a funeral that never happened.
 */
const base: Notice = {
  id: 'sample-1',
  orgId: 'sample-org',
  orgName: 'Sample Masjid of Scarborough',
  orgType: 'masjid',
  status: 'published',
  isPublic: true,
  deceasedName: 'Fulan ibn Fulan',
  showDeceasedName: true,
  janazahAt: hours(3),
  timeZone: 'America/Toronto',
  timeLabel: 'after Dhuhr',
  prayerLocation: {
    name: 'Sample Masjid',
    address: '1 Example Street, Scarborough, ON',
    lat: 43.77,
    lng: -79.25,
  },
  burialLocation: {
    name: 'Example Cemetery',
    address: '900 Example Road, Pickering, ON',
    lat: 43.85,
    lng: -79.09,
  },
  instructions: 'Parking is behind the building. Please leave the front row for family.',
  version: 1,
  publishedAt: null,
  cancelledAt: null,
  cancelReason: '',
  correctionNote: '',
  redactedAt: null,
};

const NOTICES: { notice: Notice; distanceKm?: number }[] = [
  { notice: base, distanceKm: 3.4 },
  {
    notice: {
      ...base,
      id: 'sample-2',
      orgName: 'Sample Islamic Centre',
      deceasedName: null,
      showDeceasedName: false,
      timeLabel: '',
      janazahAt: hours(26),
      prayerLocation: {
        name: 'Sample Islamic Centre',
        address: '42 Example Avenue, Mississauga, ON',
        lat: 43.6,
        lng: -79.64,
      },
    },
    distanceKm: 18.2,
  },
  {
    notice: {
      ...base,
      id: 'sample-3',
      status: 'cancelled',
      version: 2,
      orgName: 'Sample Masjid of Ottawa',
      deceasedName: 'Fulanah bint Fulan',
      cancelReason: 'Postponed. The family will announce a new time.',
      janazahAt: hours(30),
      timeLabel: '',
    },
  },
  {
    notice: {
      ...base,
      id: 'sample-4',
      version: 2,
      correctionNote: 'The prayer has moved from 1:30 to 2:15.',
      orgName: 'Sample Masjid of Vancouver',
      timeZone: 'America/Vancouver',
      deceasedName: null,
      showDeceasedName: false,
      timeLabel: '',
      janazahAt: hours(50),
    },
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: space.xxl }}>
      <View
        style={{
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          backgroundColor: colors.bgSunk,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Text variant="overline" tone="subtle">{title.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function Gallery() {
  const colors = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, gap: space.xs }}>
        <Text variant="callout" tone="muted">Assalamu Alaikum, Yusuf</Text>
        <Text variant="display" serif>Ta’ziyah</Text>
      </View>

      <Section title="Notice rows">
        {NOTICES.map(({ notice, distanceKm }, i) => (
          <View key={notice.id}>
            {i > 0 ? <Divider inset={space.lg} /> : null}
            <NoticeRow
              notice={notice}
              distanceKm={distanceKm ?? null}
              onPress={() => {}}
            />
          </View>
        ))}
      </Section>

      <Section title="Nearby, before location is on">
        <LocationGate state="undetermined" busy={false} error={null} onEnable={() => {}} />
      </Section>

      <Section title="Nearby, permanently denied">
        {/* The state that matters most to get right: Android will not prompt
            again, so a button here would silently do nothing. */}
        <LocationGate state="denied" busy={false} error={null} onEnable={() => {}} />
      </Section>

      <Section title="Nearby, with a position">
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md,
                       flexDirection: 'row', alignItems: 'center',
                       justifyContent: 'space-between' }}>
          <Button label="Within 10 km" size="compact" />
          <ViewToggle value="list" onChange={() => {}} mapAvailable />
        </View>
        {NOTICES.slice(0, 2).map(({ notice, distanceKm }, i) => (
          <View key={`near-${notice.id}`}>
            {i > 0 ? <Divider inset={space.lg} /> : null}
            <NoticeRow notice={notice} distanceKm={distanceKm ?? null} onPress={() => {}} />
          </View>
        ))}
        <View style={{ padding: space.lg }}>
          <Text variant="caption" tone="subtle">
            Distances are worked out on your phone. Your location is not sent to
            us or to any masjid, and nothing records where you have been.
          </Text>
        </View>
      </Section>

      <Section title="Notice detail">
        <View style={{ paddingVertical: space.lg }}>
          <NoticeDetail
            notice={base}
            verified
            onDirections={() => {}}
            onReport={() => {}}
          />
        </View>
      </Section>

      <Section title="Notice detail, cancelled">
        <View style={{ paddingVertical: space.lg }}>
          <NoticeDetail
            notice={NOTICES[2]!.notice}
            verified
            onDirections={() => {}}
            onReport={() => {}}
          />
        </View>
      </Section>

      <Section title="Janazah guide">
        <GuideBody />
      </Section>

      <Section title="Type">
        <View style={{ padding: space.lg, gap: space.sm }}>
          <Text variant="display" serif>Display, serif</Text>
          <Text variant="title" serif>Title, serif</Text>
          <Text variant="heading">Heading</Text>
          <Text variant="body">Body. The prayer is at the masjid on Example Street.</Text>
          <Text variant="callout" tone="muted">Callout, muted</Text>
          <Text variant="label" tone="muted">Label</Text>
          <Text variant="caption" tone="subtle">Caption, subtle</Text>
        </View>
      </Section>

      <Section title="Badges">
        <View style={{ padding: space.lg, flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <VerifiedBadge />
          <Badge tone="cancelled" label="Cancelled" />
          <Badge tone="corrected" label="Updated" />
          <Badge tone="neutral" label="Draft" />
        </View>
      </Section>

      <Section title="Buttons">
        <View style={{ padding: space.lg, gap: space.md }}>
          <Button label="Directions" kind="primary" />
          <Button label="Share" />
          <Button label="Delete account" kind="danger" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Compact" size="compact" />
            <Button label="Busy" size="compact" busy />
            <Button label="Disabled" size="compact" disabled />
          </View>
        </View>
      </Section>

      <Section title="Rows and surfaces">
        <View style={{ padding: space.lg, gap: space.lg }}>
          <Surface style={{ overflow: 'hidden' }}>
            <Row title="Notification preferences" onPress={() => {}} />
            <Divider inset={space.lg} />
            <Row title="Nearby radius" note="10 km" onPress={() => {}} />
            <Divider inset={space.lg} />
            <Row
              title="Sample Masjid of Scarborough"
              subtitle="Scarborough, Ontario"
              onPress={() => {}}
            />
          </Surface>
          <Surface padded>
            <Text variant="body">
              Parking is behind the building. Please leave the front row for family.
            </Text>
          </Surface>
        </View>
      </Section>

      <Section title="Fields">
        <View style={{ padding: space.lg, gap: space.lg }}>
          <Field label="Email address" value="someone@example.com" />
          <Field
            label="Six-digit code"
            value=""
            placeholder="000000"
            hint="From your authenticator app"
          />
        </View>
      </Section>

      <Section title="States">
        <View style={{ gap: space.lg, paddingVertical: space.md }}>
          <StaleBanner onRetry={() => {}} />
          <View style={{ paddingHorizontal: space.lg }}>
            <Empty message="No Janazah notices have been published for the days ahead." />
            <ErrorState
              message="Notices could not be loaded. You may be offline."
              onRetry={() => {}}
            />
          </View>
          <Loading />
        </View>
      </Section>
    </ScrollView>
  );
}

const root = document.getElementById('root');
if (root) {
  // The same providers the app mounts. The Firebase and Expo modules beneath
  // them are stubbed (see preview/stubs), so nothing here reaches a backend;
  // the providers exist because components legitimately read from them and a
  // harness that had to avoid those components would stop being useful.
  createRoot(root).render(
    <ThemeProvider>
      <AuthProvider>
        <FollowsProvider>
          <LocationProvider>
            <Gallery />
          </LocationProvider>
        </FollowsProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}
