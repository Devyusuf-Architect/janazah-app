// Janazahs.
//
// Every upcoming notice, grouped by day.
//
// This used to be a stack screen reached through a search box on Home, and
// Home carried a four-row preview of the same list. That is a website's
// structure: one page that shows a bit of everything, with the real list a
// click away. On a phone the list is the thing, so it gets a tab, and Home
// gets to be about what is happening now.
//
// Search is on this screen rather than a screen of its own, and it filters
// what has already been fetched rather than querying Firestore. There is no
// server-side search and there should not be one: the searchable set is the
// public feed, which is small, and an index would mean sending a backend the
// name somebody is looking for.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, SectionList, TextInput, View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/Screen';
import { PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { Divider } from '../../src/components/Surface';
import { Empty, ErrorState } from '../../src/components/States';
import {
  ConnectionBanner, SlowNotice, useSlowLoad,
} from '../../src/components/Connection';
import { NoticeSkeletonList } from '../../src/components/Skeleton';
import { RowIn } from '../../src/components/Motion';
import { SearchBar } from '../../src/features/notices/SearchBar';
import { DayHeading } from '../../src/features/notices/DayHeading';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useUpcomingNotices } from '../../src/lib/queries';
import { annotate } from '../../src/lib/nearby';
import { groupByDay } from '../../src/lib/grouping';
import { connectionOf } from '../../src/lib/connectivity';
import { search } from '../../src/lib/search';
import type { Notice } from '../../src/lib/notice';
import { space, useColors } from '../../src/theme';

export default function JanazahsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const location = useLocation();
  // Home's search field routes here with ?focus=1 rather than to a screen of
  // its own, so tapping it still opens a keyboard.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const input = useRef<TextInput>(null);

  const [query, setQuery] = useState('');

  const {
    data, isPending, isError, refetch, isRefetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useUpcomingNotices();

  const all = useMemo(
    () => data?.pages.flatMap((page) => page.notices) ?? [],
    [data],
  );
  const stale = data?.pages.some((page) => page.stale) ?? false;
  const slow = useSlowLoad(isPending);

  const results = useMemo(
    () => (query.trim() ? search(all, query) : all),
    [all, query],
  );

  // Distances are worked out here, on the device, from a point that never
  // leaves it. See src/lib/nearby.ts.
  const distances = useMemo(
    () => annotate(results, location.point),
    [results, location.point],
  );

  // Searching flattens the list: results ordered by day would bury the best
  // match under a heading, and somebody searching already knows what day they
  // are looking for.
  const sections = useMemo(
    () => (query.trim()
      ? [{ key: 'results', title: '', data: results }]
      : groupByDay(results).map((g) => ({ key: g.key, title: g.title, data: g.items }))),
    [results, query],
  );

  useFocusEffect(useCallback(() => {
    refetch();
    if (focus === '1') {
      // A frame's grace so the screen is mounted before the keyboard opens
      // over it, which otherwise leaves the field scrolled out of sight.
      const timer = setTimeout(() => input.current?.focus(), 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [refetch, focus]));

  const open = useCallback((notice: Notice) => router.push(`/n/${notice.id}`), []);

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space.lg, backgroundColor: colors.bg }}>
        <PageTitle title="Janazahs" />
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          <SearchBar
            ref={input}
            value={query}
            onChangeText={setQuery}
            placeholder="Masjid, city, or a name"
          />
        </View>
      </View>

      <ConnectionBanner
        connection={connectionOf({
          isPending, isError, fromCache: stale, hasContent: all.length > 0,
        })}
        onRetry={refetch}
      />

      {isError && all.length === 0 ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <ErrorState
            message="Notices could not be loaded. You may be offline."
            onRetry={refetch}
          />
        </View>
      ) : isPending ? (
        <>
          <NoticeSkeletonList count={5} />
          {slow ? <SlowNotice onRetry={refetch} /> : null}
        </>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(notice) => notice.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
          refreshControl={(
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          )}
          renderSectionHeader={({ section }) => (
            section.title ? <DayHeading title={section.title} /> : null
          )}
          renderItem={({ item, index, section }) => (
            <View>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              {/* Only the first screenful cascades. A row that animates in
                  when it is scrolled to arrives late, which reads as the list
                  being slow rather than as polish; RowIn treats a negative
                  index as "appear immediately". */}
              <RowIn index={section === sections[0] && index < 6 ? index : -1}>
                <NoticeRow
                  notice={item}
                  distanceKm={distances.get(item.id) ?? null}
                  onPress={open}
                />
              </RowIn>
            </View>
          )}
          ListHeaderComponent={query.trim() ? (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              <Text variant="caption" tone="subtle">
                {results.length === 1 ? '1 notice' : `${results.length} notices`}
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={(
            <View style={{ paddingHorizontal: space.lg }}>
              <Empty
                message={query.trim()
                  ? 'Nothing matched. Names are only searchable when the family '
                    + 'chose to make them public.'
                  : 'No Janazah notices have been published for the days ahead.'}
              />
            </View>
          )}
          // Paging applies to the unfiltered list only. Fetching more while
          // somebody types would shuffle results under their thumb.
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (!query.trim() && hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ListFooterComponent={isFetchingNextPage
            ? <ActivityIndicator style={{ margin: space.lg }} color={colors.accent} />
            : null}
        />
      )}
    </Screen>
  );
}
