// Home.
//
// Not a landing page. Somebody opening this has usually just been told, by
// text message or in a phone call, that a Janazah is happening, often today.
// The screen has one job at that moment: what is happening, where, and how do
// I get there.
//
// So: a one-line greeting, a search field, and then notices. Four upcoming,
// three nearby, and whatever the masjids they follow have published. Each
// section defers to its own tab rather than growing, because a home screen
// that tries to be every tab is a home screen nobody scrolls to the bottom of.

import React, { useCallback, useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Divider } from '../../src/components/Surface';
import { Loading, Empty, ErrorState, StaleBanner } from '../../src/components/States';
import { Greeting } from '../../src/features/home/Greeting';
import { SearchField } from '../../src/features/home/SearchField';
import { SectionHeader } from '../../src/features/home/SectionHeader';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { SampleBanner } from '../../src/features/home/SampleBanner';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useFollows } from '../../src/features/following/useFollows';
import { useUpcomingNotices, useNoticesFromOrgs } from '../../src/lib/queries';
import { nearbyNotices, annotate } from '../../src/lib/nearby';
import type { Notice } from '../../src/lib/notice';
import { space, useColors } from '../../src/theme';

/** How many rows each section shows before deferring to its own tab. */
const UPCOMING_LIMIT = 4;
const NEAR_LIMIT = 3;
const FOLLOWED_LIMIT = 4;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();

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

  // Refetched when the tab is focused rather than kept on a live listener.
  // Somebody who backgrounds the app on the way to a masjid and reopens it in
  // the car park gets the current time; a socket held open all night does not
  // earn its battery.
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);

  return (
    <Screen>
      <ScreenScroll
        contentContainerStyle={{ paddingTop: insets.top + space.md }}
        refreshControl={(
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        )}
      >
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Greeting />
          <SearchField />
        </View>

        <SampleBanner />

        {stale ? (
          <View style={{ paddingTop: space.lg }}>
            <StaleBanner onRetry={refetch} />
          </View>
        ) : null}

        <SectionHeader
          title="Upcoming"
          action={notices.length > UPCOMING_LIMIT
            ? { label: 'See all', onPress: () => router.push('/search') }
            : undefined}
        />

        {isPending ? <Loading label="Loading notices" /> : null}

        {isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <ErrorState
              message="Notices could not be loaded. You may be offline."
              onRetry={refetch}
            />
          </View>
        ) : null}

        {!isPending && !isError && notices.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Empty message="No Janazah notices have been published for the days ahead." />
          </View>
        ) : null}

        {notices.slice(0, UPCOMING_LIMIT).map((notice, index) => (
          <View key={notice.id}>
            {index > 0 ? <Divider inset={space.lg} /> : null}
            <NoticeRow
              notice={notice}
              distanceKm={distances.get(notice.id) ?? null}
              onPress={open}
            />
          </View>
        ))}

        <SectionHeader
          title="Near you"
          action={{ label: 'Open', onPress: () => router.push('/nearby') }}
        />

        {location.point ? (
          near.length ? (
            near.slice(0, NEAR_LIMIT).map(({ notice, km }, index) => (
              <View key={notice.id}>
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
            {/* One row, not half a screen. The brief was explicit that a
                disabled state must not take over the page, and this is the
                state most people see on first launch. The explanation of what
                location is for lives in Nearby, where the permission is
                actually requested. */}
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
            onPress: () => router.push(follows.ids.length ? '/following' : '/masjids'),
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
      </ScreenScroll>
    </Screen>
  );
}
