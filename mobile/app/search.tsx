// Search.
//
// Over the notices already fetched, on the device. There is no server-side
// search and there should not be one: the searchable set is the public feed,
// which is small, and a server index would mean sending queries about who
// somebody is looking for to a backend that has no need to know it.
//
// With an empty query this is the full upcoming feed rather than a blank
// screen, so the search box doubles as "see all notices" and there is no
// separate list to maintain.

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../src/components/Screen';
import { Text } from '../src/components/Text';
import { Field } from '../src/components/Field';
import { Button } from '../src/components/Button';
import { Divider } from '../src/components/Surface';
import { Loading, Empty, ErrorState, StaleBanner } from '../src/components/States';
import { NoticeRow } from '../src/features/notices/NoticeRow';
import { useUpcomingNotices } from '../src/lib/queries';
import { search } from '../src/lib/search';
import type { Notice } from '../src/lib/notice';
import { space, useColors } from '../src/theme';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [query, setQuery] = useState('');

  const {
    data, isPending, isError, refetch,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useUpcomingNotices();

  const all = useMemo(
    () => data?.pages.flatMap((page) => page.notices) ?? [],
    [data],
  );
  const stale = data?.pages.some((page) => page.stale) ?? false;

  const results = useMemo(
    () => (query.trim() ? search(all, query) : all),
    [all, query],
  );

  const open = useCallback((notice: Notice) => router.push(`/n/${notice.id}`), []);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Search' }} />
      <View style={{ paddingTop: insets.top + space.md }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Button
              label="Back"
              size="compact"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          </View>
          <Field
            label="Search"
            hint="Masjid, city, or a name the family chose to share"
            value={query}
            onChangeText={setQuery}
            placeholder="Search Janazah, Masjid, city…"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {stale ? (
        <View style={{ paddingTop: space.md }}>
          <StaleBanner onRetry={refetch} />
        </View>
      ) : null}

      {isPending ? <Loading label="Loading notices" /> : null}

      {isError ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <ErrorState
            message="Notices could not be loaded. You may be offline."
            onRetry={refetch}
          />
        </View>
      ) : null}

      {!isPending && !isError ? (
        <FlatList
          data={results}
          keyExtractor={(notice) => notice.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.xxl,
          }}
          ItemSeparatorComponent={() => <Divider inset={space.lg} />}
          renderItem={({ item }) => <NoticeRow notice={item} onPress={open} />}
          ListHeaderComponent={
            query.trim() ? (
              <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
                <Text variant="caption" tone="subtle">
                  {results.length === 1
                    ? '1 notice'
                    : `${results.length} notices`}
                </Text>
              </View>
            ) : null
          }
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
          // Paging only matters for the unfiltered list. A search runs over
          // what has been fetched, so fetching more while somebody types would
          // shuffle results under them.
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (!query.trim() && hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          ListFooterComponent={
            isFetchingNextPage
              ? <ActivityIndicator style={{ margin: space.lg }} color={colors.accent} />
              : null
          }
        />
      ) : null}
    </Screen>
  );
}
