// Home.
//
// Somebody opening this has usually just been told, by text message or in a
// phone call, that a Janazah is happening, often today. The screen has one
// job at that moment: what is happening, where, and how do I get there.
//
// The first version answered it with four sections of four rows each, which
// is a website's home page. This one leads with the next Janazah and with
// anything that has changed, then thins out: three near you, three from the
// masjids you follow, and the guide. Everything defers to its own tab rather
// than growing, because a home screen that tries to be every tab is a home
// screen nobody scrolls to the bottom of.

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Divider } from '../../src/components/Surface';
import { Empty, ErrorState, StaleBanner } from '../../src/components/States';
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
import { isCancelled, isCorrected, type Notice } from '../../src/lib/notice';
import type { MapDestination } from '../../src/shared/geo';
import { space, useColors } from '../../src/theme';

/** How many rows each section shows before deferring to its own tab. */
const NEAR_LIMIT = 3;
const FOLLOWED_LIMIT = 3;
const UPDATE_LIMIT = 3;

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
  // needs to see even if they saw the notice yesterday, so it is pulled out
  // of the feed rather than left in date order among unchanged notices.
  const updates = useMemo(
    () => notices.filter((n) => isCancelled(n) || isCorrected(n)),
    [notices],
  );

  // The soonest one, and it is the only thing on Home given any size.
  const next = notices.find((n) => !isCancelled(n)) ?? null;
  const rest = useMemo(
    () => notices.filter((n) => n !== next && !isCancelled(n)).slice(0, 3),
    [notices, next],
  );

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

        {stale ? (
          <View style={{ paddingTop: space.md }}>
            <StaleBanner onRetry={refetch} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg }}>
          <CoordinatorCard />

          {isError ? (
            <ErrorState
              message="Notices could not be loaded. You may be offline."
              onRetry={refetch}
            />
          ) : null}

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
            <Empty message="No Janazah notices have been published for the days ahead." />
          ) : null}
        </View>

        {isPending ? <NoticeSkeletonList count={4} /> : null}

        {updates.length ? (
          <>
            <SectionHeader title="Changed or cancelled" />
            {updates.slice(0, UPDATE_LIMIT).map((notice, index) => (
              <View key={`update-${notice.id}`}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <NoticeRow
                  notice={notice}
                  distanceKm={distances.get(notice.id) ?? null}
                  onPress={open}
                />
              </View>
            ))}
          </>
        ) : null}

        {rest.length ? (
          <>
            <SectionHeader
              title="Also coming up"
              action={{ label: 'See all', onPress: () => router.push('/(tabs)/janazahs') }}
            />
            {rest.map((notice, index) => (
              <View key={notice.id}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <RowIn index={index + 1}>
                  <NoticeRow
                    notice={notice}
                    distanceKm={distances.get(notice.id) ?? null}
                    onPress={open}
                  />
                </RowIn>
              </View>
            ))}
          </>
        ) : null}

        <SectionHeader
          title="Near you"
          action={{ label: 'Open', onPress: () => router.push('/(tabs)/nearby') }}
        />

        {location.point ? (
          near.length ? (
            near.slice(0, NEAR_LIMIT).map(({ notice, km }, index) => (
              <View key={`near-${notice.id}`}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <NoticeRow notice={notice} distanceKm={km} onPress={open} />
              </View>
            ))
          ) : (
            <View style={{ paddingHorizontal: space.lg }}>
              <Text variant="callout" tone="muted">
                Nothing within your chosen distance in the days ahead.
              </Text>
            </View>
          )
        ) : (
          <View style={{ paddingHorizontal: space.lg }}>
            {/* One line, not half a screen. This is the state most people see
                on first launch, and the explanation of what location is for
                lives in Nearby, where the permission is actually requested. */}
            <Text variant="callout" tone="muted">
              Turn on location in Nearby to see which of these are close to you.
              It stays on your phone.
            </Text>
          </View>
        )}

        <SectionHeader
          title="Masjids you follow"
          action={{
            label: follows.ids.length ? 'Open' : 'Find one',
            onPress: () => router.push(
              follows.ids.length ? '/(tabs)/following' : '/masjids',
            ),
          }}
        />

        {follows.ids.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Text variant="callout" tone="muted">
              Follow a masjid to see its notices here, and to be told when it
              publishes one.
            </Text>
          </View>
        ) : (followed.data?.notices ?? []).length === 0 ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Text variant="callout" tone="muted">
              Nothing upcoming from the masjids you follow.
            </Text>
          </View>
        ) : (
          (followed.data?.notices ?? []).slice(0, FOLLOWED_LIMIT).map((notice, index) => (
            <View key={`followed-${notice.id}`}>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              <NoticeRow
                notice={notice}
                distanceKm={distances.get(notice.id) ?? null}
                onPress={open}
              />
            </View>
          ))
        )}

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
