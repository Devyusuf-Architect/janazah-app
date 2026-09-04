// The directory of verified masjids.
//
// Every organization a platform administrator has approved, which is what the
// rules make publicly readable: the query carries
// where('verificationStatus','==','verified') because for a list Firestore
// evaluates the rule against the query rather than the results, so an
// unfiltered read fails outright rather than leaking a pending application.
//
// Filtering is local, over a list small enough to hold, for the same reason
// notice search is local: there is no need to tell a server which masjid
// somebody is looking for.

import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../src/components/Screen';
import { ScreenHeader, PageTitle } from '../src/components/ScreenHeader';
import { NoticeSkeletonList } from '../src/components/Skeleton';
import { RowIn } from '../src/components/Motion';
import { SearchBar } from '../src/features/notices/SearchBar';
import { Text } from '../src/components/Text';
import { Divider } from '../src/components/Surface';
import { Empty, ErrorState } from '../src/components/States';
import { FollowButton } from '../src/features/following/FollowButton';
import { useVerifiedOrganizations } from '../src/lib/queries';
import { fold } from '../src/lib/search';
import { space } from '../src/theme';

export default function MasjidsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { data, isPending, isError, refetch } = useVerifiedOrganizations();

  const results = useMemo(() => {
    const all = data ?? [];
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return all;
    return all.filter((org) => {
      const text = fold([org.name, org.city, org.province, org.address]
        .filter(Boolean).join(' '));
      return words.every((word) => text.includes(word));
    });
  }, [data, query]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Masjids' }} />
      <ScreenHeader />
      <PageTitle
        title="Masjids"
        subtitle={'Organizations a Ta’ziyah administrator has verified. Follow '
          + 'one to hear about its Janazah notices.'}
      />
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Name or city"
        />
      </View>

      {isPending ? <NoticeSkeletonList count={4} /> : null}

      {isError ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
          <ErrorState
            message="The directory could not be loaded. You may be offline."
            onRetry={refetch}
          />
        </View>
      ) : null}

      {!isPending && !isError ? (
        <FlatList
          data={results}
          keyExtractor={(org) => org.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.xxl,
          }}
          ItemSeparatorComponent={() => <Divider inset={space.lg} />}
          ListEmptyComponent={(
            <View style={{ paddingHorizontal: space.lg }}>
              <Empty
                message={query.trim()
                  ? 'No verified masjid matched that.'
                  : 'No masjids have been verified yet.'}
              />
            </View>
          )}
          renderItem={({ item, index }) => (
            <RowIn
              index={index < 8 ? index : -1}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  variant="body"
                  onPress={() => router.push(`/o/${item.id}`)}
                  accessibilityRole="link"
                >
                  {item.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {[item.city, item.province].filter(Boolean).join(', ')}
                </Text>
              </View>
              <FollowButton orgId={item.id} />
            </RowIn>
          )}
        />
      ) : null}
    </Screen>
  );
}
