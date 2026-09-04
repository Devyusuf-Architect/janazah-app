// Nearby.
//
// The feature this application exists for: hearing about a Janazah close to
// where you actually are, rather than close to where you live.
//
// The match runs here, on the phone, against notices the feed already
// fetched. Nothing about where the reader is reaches Firestore, a masjid, or
// a log. That is not an implementation detail to be optimised away later; it
// is the reason the design is shaped this way, and test/location.test.ts
// fails the build if a module on this path grows a way to write.

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/Screen';
import { PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { Divider } from '../../src/components/Surface';
import { Loading, Empty, ErrorState } from '../../src/components/States';
import { NoticeSkeletonList } from '../../src/components/Skeleton';
import {
  ConnectionBanner, SlowNotice, useSlowLoad,
} from '../../src/components/Connection';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { LocationGate } from '../../src/features/nearby/LocationGate';
import { RadiusSheet } from '../../src/features/nearby/RadiusSheet';
import { ViewToggle, type NearbyView } from '../../src/features/nearby/ViewToggle';
import { NearbyMap, mapAvailable } from '../../src/features/nearby/NearbyMap';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useUpcomingNotices } from '../../src/lib/queries';
import { nearbyNotices } from '../../src/lib/nearby';
import { connectionOf } from '../../src/lib/connectivity';
import { RADIUS_OPTIONS } from '../../src/lib/nearby';
import type { Notice } from '../../src/lib/notice';
import { space, useColors } from '../../src/theme';

export default function NearbyScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const location = useLocation();

  const [view, setView] = useState<NearbyView>('list');
  const [radiusOpen, setRadiusOpen] = useState(false);

  const {
    data, isPending, isError, refetch, isRefetching,
  } = useUpcomingNotices();

  const notices = useMemo(
    () => data?.pages.flatMap((page) => page.notices) ?? [],
    [data],
  );
  const feedStale = data?.pages.some((page) => page.stale) ?? false;
  const slow = useSlowLoad(isPending);

  const results = useMemo(
    () => nearbyNotices(notices, location.point, location.prefs.radiusKm),
    [notices, location.point, location.prefs.radiusKm],
  );

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);
  const radiusLabel = RADIUS_OPTIONS
    .find((o) => o.km === location.prefs.radiusKm)?.label ?? '';

  const showingMap = view === 'map' && !!location.point;

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space.lg }}>
        <PageTitle title="Nearby" />

        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          {location.point ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.md,
              }}
            >
              <Button
                label={`Within ${radiusLabel}`}
                size="compact"
                onPress={() => setRadiusOpen(true)}
              />
              <ViewToggle
                value={view}
                onChange={setView}
                mapAvailable={mapAvailable()}
              />
            </View>
          ) : null}
        </View>
      </View>

      {!location.ready ? <Loading label="Checking location" /> : null}

      {location.ready && !location.point ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}>
          <LocationGate
            state={location.permission}
            busy={location.busy}
            error={location.error}
            onEnable={location.enable}
          />
        </ScrollView>
      ) : null}

      {location.point && showingMap ? (
        <NearbyMap
          from={location.point}
          results={results}
          radiusKm={location.prefs.radiusKm}
          onSelect={open}
        />
      ) : null}

      {location.point && !showingMap ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          refreshControl={(
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { refetch(); location.refresh(); }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          )}
        >
          {location.stale ? (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
              {/* Distinct from the offline banner: the notices may be current
                  while the position they were measured against is hours old,
                  and a distance from where somebody was this morning is not a
                  distance. */}
              <Text variant="caption" tone="subtle">
                These distances are from where you were a few hours ago.
                {' '}
                <Text
                  variant="caption"
                  style={{ color: colors.accent }}
                  onPress={location.refresh}
                >
                  Update my location
                </Text>
              </Text>
            </View>
          ) : null}

          <ConnectionBanner
            connection={connectionOf({
              isPending, isError, fromCache: feedStale,
              hasContent: notices.length > 0,
            })}
            onRetry={refetch}
          />

          {isPending ? (
            <>
              <NoticeSkeletonList count={3} />
              {slow ? <SlowNotice onRetry={refetch} /> : null}
            </>
          ) : null}

          {isError && notices.length === 0 ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <ErrorState
                message="Notices could not be loaded. You may be offline."
                onRetry={refetch}
              />
            </View>
          ) : null}

          {!isPending && !isError && results.length === 0 ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <Empty
                message={
                  location.prefs.radiusKm === 0
                    ? 'No Janazah notices have been published with a location yet.'
                    : `No Janazahs within ${radiusLabel} in the days ahead.`
                }
                action={location.prefs.radiusKm === 0
                  ? undefined
                  : { label: 'Search further', onPress: () => setRadiusOpen(true) }}
              />
            </View>
          ) : null}

          {results.map(({ notice, km }, index) => (
            <View key={notice.id}>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              <NoticeRow notice={notice} distanceKm={km} onPress={open} />
            </View>
          ))}

          {results.length ? (
            // One line, not a paragraph. The full explanation is behind
            // "How location works" on the gate, and repeating it under every
            // list is how the claim starts reading as a disclaimer.
            <View style={{ padding: space.lg, gap: space.md, alignItems: 'flex-start' }}>
              <Text variant="caption" tone="subtle">
                Distances are worked out on this phone.
              </Text>
              <Button
                label="Turn off location"
                size="compact"
                onPress={location.turnOff}
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      <RadiusSheet
        visible={radiusOpen}
        value={location.prefs.radiusKm}
        onPick={location.setRadius}
        onClose={() => setRadiusOpen(false)}
      />
    </Screen>
  );
}
