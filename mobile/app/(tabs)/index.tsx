// Home.
//
// Somebody opening this has usually just been told, by text message or in a
// phone call, that a Janazah is happening, often today. The screen has one
// job at that moment: what is happening, where, and how do I get there.
//
// It answers that in one card and then stops. What is underneath is two short
// lists and a link, and neither list repeats the card or the Janazahs tab:
//
//   the next Janazah, with Directions on it, the only primary action here
//   anything changed or cancelled, which is the one thing worth interrupting
//   two rows from the masjids you follow
//   two rows near you
//   the guide
//
// An earlier version also carried "Also coming up", which was the Janazahs
// tab reproduced four rows at a time. A home screen that tries to be every
// tab is a home screen nobody scrolls to the bottom of.

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Divider } from '../../src/components/Surface';
import { Empty } from '../../src/components/States';
import {
  ConnectionBanner, SlowNotice, useSlowLoad,
} from '../../src/components/Connection';
import { NoticeSkeletonList } from '../../src/components/Skeleton';
import { RowIn } from '../../src/components/Motion';
import { HomeHeader } from '../../src/features/home/HomeHeader';
import { SearchField } from '../../src/features/home/SearchField';
import { SectionHeader } from '../../src/features/home/SectionHeader';
import { CoordinatorCard } from '../../src/features/home/CoordinatorCard';
import { NextUp } from '../../src/features/home/NextUp';
import { GuideLink } from '../../src/features/home/GuideLink';
import { SampleBanner } from '../../src/features/home/SampleBanner';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { DirectionsSheet } from '../../src/features/notices/DirectionsSheet';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useFollows } from '../../src/features/following/useFollows';
import { useUpcomingNotices, useNoticesFromOrgs } from '../../src/lib/queries';
import { nearbyNotices, annotate } from '../../src/lib/nearby';
import { connectionOf } from '../../src/lib/connectivity';
import { isCancelled, isCorrected, type Notice } from '../../src/lib/notice';
import type { MapDestination } from '../../src/shared/geo';
import { space, useColors } from '../../src/theme';

/** Two rows a section. Three was a list; this is a pointer to one. */
const PREVIEW = 2;
const UPDATE_LIMIT = 2;

export default function HomeScreen() {
  const colors = useColors();
  const [destination, setDestination] = useState<MapDestination | null>(null);

  const location = useLocation();
  const follows = useFollows();
  const followed = useNoticesFromOrgs(follows.ids);
  const {
    data, isPending, isError, refetch, isRefetching,
  } = useUpcomingNotices();

  const notices = useMemo(
    () => data?.pages.flatMap((page) => page.notices) ?? [],
    [data],
  );
  const stale = data?.pages.some((page) => page.stale) ?? false;
  const slow = useSlowLoad(isPending);

  // Distances for every row, and the subset that is actually close. Both are
  // computed here, on the device, from a point that never leaves it.
  const distances = useMemo(
    () => annotate(notices, location.point),
    [notices, location.point],
  );
  const near = useMemo(
    () => nearbyNotices(notices, location.point, location.prefs.radiusKm),
    [notices, location.point, location.prefs.radiusKm],
  );

  // A cancellation or a moved time is the one thing on this screen somebody
  // needs to see even if they read the notice yesterday, so it is pulled out
  // of the feed rather than left in date order among unchanged notices.
  const updates = useMemo(
    () => notices.filter((n) => isCancelled(n) || isCorrected(n)),
    [notices],
  );

  const next = notices.find((n) => !isCancelled(n)) ?? null;
  const followedRows = (followed.data?.notices ?? []).filter((n) => n.id !== next?.id);
  const nearRows = near.filter(({ notice }) => notice.id !== next?.id);

  // Refetched when the tab is focused rather than kept on a live listener.
  // Somebody who backgrounds the app on the way to a masjid and reopens it in
  // the car park gets the current time; a socket held open all night does not
  // earn its battery.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingTop: 0 }}
        refreshControl={(
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        )}
      >
        <HomeHeader>
          <SearchField />
        </HomeHeader>

        <SampleBanner />

        <ConnectionBanner
          connection={connectionOf({
            isPending, isError, fromCache: stale, hasContent: notices.length > 0,
          })}
          onRetry={refetch}
        />

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }}>
          <CoordinatorCard />

          {isPending ? null : next ? (
            <RowIn index={0}>
              <NextUp
                notice={next}
                distanceKm={distances.get(next.id) ?? null}
                onPress={open}
                onDirections={setDestination}
              />
            </RowIn>
          ) : !isError ? (
            <Empty message="Nothing is scheduled for the days ahead." />
          ) : null}
        </View>

        {isPending ? (
          <>
            <NoticeSkeletonList count={3} />
            {slow ? <SlowNotice onRetry={refetch} /> : null}
          </>
        ) : null}

        {updates.length ? (
          <Section
            title="Changed or cancelled"
            rows={updates.slice(0, UPDATE_LIMIT)}
            distances={distances}
            onOpen={open}
          />
        ) : null}

        {followedRows.length ? (
          <Section
            title="Masjids you follow"
            action={{ label: 'Open', onPress: () => router.push('/(tabs)/following') }}
            rows={followedRows.slice(0, PREVIEW)}
            distances={distances}
            onOpen={open}
          />
        ) : follows.ids.length === 0 ? (
          <Hint
            title="Masjids you follow"
            text="Follow a masjid to hear when it announces a Janazah."
            action={{ label: 'Find one', onPress: () => router.push('/masjids') }}
          />
        ) : null}

        {nearRows.length ? (
          <Section
            title="Near you"
            action={{ label: 'Open', onPress: () => router.push('/(tabs)/nearby') }}
            rows={nearRows.slice(0, PREVIEW).map(({ notice }) => notice)}
            distances={new Map(nearRows.map(({ notice, km }) => [notice.id, km]))}
            onOpen={open}
          />
        ) : !location.point ? (
          <Hint
            title="Near you"
            text="See which Janazahs are close. Your location stays on this phone."
            action={{ label: 'Turn on', onPress: () => router.push('/(tabs)/nearby') }}
          />
        ) : null}

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.xl }}>
          <GuideLink />
        </View>
      </ScreenScroll>

      <DirectionsSheet
        destination={destination}
        onClose={() => setDestination(null)}
      />
    </Screen>
  );
}

/** A heading and at most two rows. Anything longer belongs in its own tab. */
function Section({ title, action, rows, distances, onOpen }: {
  title: string;
  action?: { label: string; onPress: () => void };
  rows: Notice[];
  distances: Map<string, number>;
  onOpen: (notice: Notice) => void;
}) {
  return (
    <>
      <SectionHeader title={title} action={action} />
      {rows.map((notice, index) => (
        <View key={`${title}-${notice.id}`}>
          {index > 0 ? <Divider inset={space.lg} /> : null}
          <NoticeRow
            notice={notice}
            distanceKm={distances.get(notice.id) ?? null}
            onPress={onOpen}
          />
        </View>
      ))}
    </>
  );
}

/**
 * An empty section, in one line and one control.
 *
 * The previous version wrote a sentence or two of explanation under each
 * empty heading, which on a first launch made most of Home an argument for
 * features nobody had turned on yet. The full explanation lives where the
 * thing is actually switched on.
 */
function Hint({ title, text, action }: {
  title: string;
  text: string;
  action: { label: string; onPress: () => void };
}) {
  return (
    <>
      <SectionHeader title={title} action={action} />
      <View style={{ paddingHorizontal: space.lg }}>
        <Text variant="callout" tone="muted">{text}</Text>
      </View>
    </>
  );
}
