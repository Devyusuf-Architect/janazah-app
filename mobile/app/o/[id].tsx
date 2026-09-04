// One masjid.
//
// Reached from the directory, from Following, and from an Android App Link on
// https://taziyah.com/o/{id}, which is why this route exists rather than the
// directory simply expanding a row.
//
// A verified organization is world-readable by design: the community feed
// needs masjid names and prayer locations. An unverified one is not, and the
// rules enforce that rather than this screen, so a denial here shows the
// "no longer listed" state rather than an error.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { NoticeSkeletonList } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { Surface, Divider } from '../../src/components/Surface';
import { VerifiedBadge } from '../../src/components/Badge';
import { Empty, ErrorState } from '../../src/components/States';
import { NoticeRow } from '../../src/features/notices/NoticeRow';
import { FollowButton } from '../../src/features/following/FollowButton';
import { useLocation } from '../../src/features/nearby/useLocation';
import { useOrganization, useNoticesFromOrgs } from '../../src/lib/queries';
import { isVerified, type Notice } from '../../src/lib/notice';
import { annotate } from '../../src/lib/nearby';
import { space } from '../../src/theme';

export default function OrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useLocation();

  const { data: org, isPending, isError, refetch } = useOrganization(id);
  const notices = useNoticesFromOrgs(org ? [org.id] : []);

  const distances = useMemo(
    () => annotate(notices.data?.notices ?? [], location.point),
    [notices.data, location.point],
  );

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: org?.name ?? 'Masjid' }} />
      <ScreenHeader />
      <ScreenScroll>
        {isPending ? <NoticeSkeletonList count={3} /> : null}

        {isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <ErrorState
              message="This masjid could not be loaded. You may be offline."
              onRetry={refetch}
            />
          </View>
        ) : null}

        {!isPending && !isError && !org ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Empty
              message={
                'This masjid is not listed. Only organizations a Ta’ziyah '
                + 'administrator has verified appear here.'
              }
            />
          </View>
        ) : null}

        {org ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Text accessibilityRole="header" variant="display">
                {org.name}
              </Text>
              {isVerified(org) ? <VerifiedBadge /> : null}
              <Text variant="callout" tone="muted">
                {[org.address, org.city, org.province].filter(Boolean).join(', ')}
              </Text>
            </View>

            <FollowButton orgId={org.id} size="regular" full />

            {isVerified(org) ? (
              <Surface padded>
                {/* The same distinction the web app makes and the notice
                    screen repeats: the badge is about this organization,
                    never about any particular notice it publishes. */}
                <Text variant="caption" tone="subtle">
                  A Ta’ziyah administrator confirmed this organization before it
                  could publish anything. The badge is about the masjid, not
                  about any one notice.
                </Text>
              </Surface>
            ) : null}

            <View>
              <Text
                variant="overline"
                tone="subtle"
                style={{ textTransform: 'uppercase' }}
              >
                Upcoming
              </Text>
            </View>
          </View>
        ) : null}

        {org ? (
          <>
            {notices.isPending ? <NoticeSkeletonList count={2} /> : null}
            {notices.data && notices.data.notices.length === 0 ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <Empty message="Nothing upcoming from this masjid." />
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
      </ScreenScroll>
    </Screen>
  );
}
