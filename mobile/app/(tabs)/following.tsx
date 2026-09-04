// Following.
//
// Two things on one screen: the notices from masjids this reader follows, and
// the list of masjids themselves so they can be unfollowed without hunting
// for the page they were followed from.
//
// Following is still a preference on the device, mirrored to the account
// rather than owned by it. That is what lets the same list work on the
// website, where reading is open to anyone. The mobile app requires an
// account, so the signed-out path here is only ever the moment between
// signing out and the gate moving the app back to the door.

import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { Button } from '../../src/components/Button';
import { Surface, Divider } from '../../src/components/Surface';
import { Row } from '../../src/components/Row';
import { Loading, Empty, ErrorState, StaleBanner } from '../../src/components/States';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { FollowButton } from '../../src/features/following/FollowButton';
import { useFollows } from '../../src/features/following/useFollows';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useNoticesFromOrgs, useVerifiedOrganizations } from '../../src/lib/queries';
import { annotate } from '../../src/lib/nearby';
import { useAuth } from '../../src/lib/auth';
import type { Notice } from '../../src/lib/notice';
import { space, useColors } from '../../src/theme';

export default function FollowingScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user, isAnonymous } = useAuth();
  const follows = useFollows();
  const location = useLocation();
  const [showList, setShowList] = useState(false);

  const orgs = useVerifiedOrganizations();
  const notices = useNoticesFromOrgs(follows.ids);

  const followed = useMemo(
    () => (orgs.data ?? []).filter((org) => follows.ids.includes(org.id)),
    [orgs.data, follows.ids],
  );

  const distances = useMemo(
    () => annotate(notices.data?.notices ?? [], location.point),
    [notices.data, location.point],
  );

  useFocusEffect(useCallback(() => {
    if (follows.ids.length) notices.refetch();
  }, [follows.ids.length]));

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);
  const signedIn = !!user && !isAnonymous;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.xxl,
        }}
        refreshControl={(
          <RefreshControl
            refreshing={notices.isRefetching}
            onRefresh={() => { notices.refetch(); orgs.refetch(); }}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        )}
      >
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          <Text variant="display" serif>Following</Text>

          {follows.ids.length ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="callout" tone="muted">
                {follows.ids.length === 1
                  ? '1 masjid'
                  : `${follows.ids.length} masjids`}
              </Text>
              <Button
                label={showList ? 'Hide the list' : 'Manage'}
                size="compact"
                onPress={() => setShowList(!showList)}
              />
            </View>
          ) : null}
        </View>

        {!follows.ready ? <Loading label="Loading" /> : null}

        {follows.ready && follows.ids.length === 0 ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
            <Empty
              message={
                'You are not following any masjids yet. Follow one and its '
                + 'notices appear here, and on your home screen.'
              }
              action={{
                label: 'Find a masjid',
                onPress: () => router.push('/masjids'),
              }}
            />
          </View>
        ) : null}

        {showList && followed.length ? (
          <View style={{ padding: space.lg }}>
            <Surface style={{ overflow: 'hidden' }}>
              {followed.map((org, index) => (
                <View key={org.id}>
                  {index > 0 ? <Divider inset={space.lg} /> : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingRight: space.lg,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Row
                        title={org.name}
                        subtitle={[org.city, org.province].filter(Boolean).join(', ')}
                        onPress={() => router.push(`/o/${org.id}`)}
                      />
                    </View>
                    <FollowButton orgId={org.id} />
                  </View>
                </View>
              ))}
            </Surface>
          </View>
        ) : null}

        {follows.ids.length ? (
          <>
            {notices.data?.stale ? <StaleBanner onRetry={notices.refetch} /> : null}

            {notices.isPending ? <Loading label="Loading notices" /> : null}

            {notices.isError ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <ErrorState
                  message="These notices could not be loaded. You may be offline."
                  onRetry={notices.refetch}
                />
              </View>
            ) : null}

            {notices.data && notices.data.notices.length === 0 ? (
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>
                <Empty
                  message={
                    'Nothing upcoming from the masjids you follow. You will be '
                    + 'told when there is.'
                  }
                />
              </View>
            ) : null}

            {(notices.data?.notices ?? []).map((notice, index) => (
              <View key={notice.id}>
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

        <View style={{ padding: space.lg }}>
          {signedIn ? (
            <Text variant="caption" tone="subtle">
              {follows.synced
                ? 'These masjids are saved to your account, so they are the same '
                  + 'here and at taziyah.com.'
                : 'Saving these to your account.'}
            </Text>
          ) : (
            <Text variant="caption" tone="subtle">
              These masjids are saved on this phone. Sign in and they follow you
              to taziyah.com and to any other device.
            </Text>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
