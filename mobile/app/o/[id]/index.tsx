// One masjid.
//
// Reached from the directory, from Masjids, and from an Android App Link on
// https://taziyah.com/o/{id}, which is why this route exists rather than the
// directory simply expanding a row.
//
// A verified organization is world-readable by design: the community feed
// needs masjid names and prayer locations. An unverified one is not, and the
// rules enforce that rather than this screen, so a denial here shows the
// "no longer listed" state rather than an error.
//
// The same route serves two audiences. A family looking up a janazah time
// sees the name, the badge and what is coming up. The people who run the
// masjid see all of that plus a management card, because they arrive here
// from Home expecting their own masjid rather than a stranger's. What
// separates them is orgRole(), which reads ownerUid and staffUids off a
// document the rules already decided this account could read, and which
// grants nothing: every write is checked again by Firestore.

import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { NoticeSkeletonList } from '../../../src/components/Skeleton';
import { Text } from '../../../src/components/Text';
import { Surface, Divider } from '../../../src/components/Surface';
import { VerifiedBadge, OrgStatusBadge } from '../../../src/components/Badge';
import { Empty, EmptyNote, ErrorState } from '../../../src/components/States';
import { NoticeRow } from '../../../src/features/notices/NoticeRow';
import { FollowButton } from '../../../src/features/following/FollowButton';
import { ManageCard, openConsole } from '../../../src/features/org/ManageCard';
import { useLocation } from '../../../src/features/nearby/useLocation';
import { useOrganization, useNoticesFromOrgs } from '../../../src/lib/queries';
import { useAuth } from '../../../src/lib/auth';
import { canManageNotices, canEditOrg, orgRole } from '../../../src/lib/org-role';
import { listState } from '../../../src/lib/list-state';
import { isVerified, type Notice } from '../../../src/lib/notice';
import { annotate } from '../../../src/lib/nearby';
import { space } from '../../../src/theme';

export default function OrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const location = useLocation();
  const { user, isAnonymous } = useAuth();

  const { data: org, isPending, isError, refetch } = useOrganization(id);
  const notices = useNoticesFromOrgs(org ? [org.id] : []);

  // An edit made on the next screen should be on this one when it comes back,
  // and useOrganization holds a result for half an hour. Refetching on focus
  // is cheaper than threading an invalidation through every way back here.
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));

  const role = orgRole(org, user && !isAnonymous ? user.uid : null);
  const manages = canEditOrg(role);

  const distances = useMemo(
    () => annotate(notices.data?.notices ?? [], location.point),
    [notices.data, location.point],
  );

  const open = (notice: Notice) => router.push(`/n/${notice.id}`);

  // What the Upcoming section should actually be showing. A disabled query
  // and a slow one both report "pending" in TanStack Query, and reading that
  // alone is what left a skeleton on screen forever for a masjid with
  // nothing published. See src/lib/list-state.ts.
  const upcoming = listState({
    status: notices.status,
    fetchStatus: notices.fetchStatus,
    count: notices.data?.notices.length ?? 0,
  });

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
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {isVerified(org) ? <VerifiedBadge /> : null}
                {/* The rest of the lifecycle is shown only to the people it
                    concerns. A family has no use for "pending review", and
                    for anyone else this document would not have loaded. */}
                {manages && !isVerified(org)
                  ? <OrgStatusBadge status={org.verificationStatus} />
                  : null}
              </View>
              <Text variant="callout" tone="muted">
                {[org.address, org.city, org.province].filter(Boolean).join(', ')}
              </Text>
            </View>

            {manages ? (
              <ManageCard org={org} role={role} />
            ) : (
              <FollowButton orgId={org.id} size="regular" full />
            )}

            {manages && org.statusReason ? (
              <Surface padded>
                <Text variant="label">A note from the administrators</Text>
                <Text variant="callout" tone="muted">{org.statusReason}</Text>
              </Surface>
            ) : null}

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
            {upcoming === 'loading' ? <NoticeSkeletonList count={2} /> : null}

            {upcoming === 'error' ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <ErrorState
                  message="Upcoming janazahs could not be loaded. You may be offline."
                  onRetry={notices.refetch}
                />
              </View>
            ) : null}

            {/* 'idle' lands here too. A query that was never going to run has
                nothing to wait for, and a skeleton for it is a lie. */}
            {upcoming === 'empty' || upcoming === 'idle' ? (
              <View style={{ paddingHorizontal: space.lg }}>
                <EmptyNote
                  title="No upcoming Janazahs"
                  message="This Masjid has not published any upcoming Janazah notices."
                  action={canManageNotices(role, org)
                    ? { label: 'Post a Janazah', onPress: openConsole }
                    : undefined}
                />
              </View>
            ) : null}

            {upcoming === 'ready'
              ? (notices.data?.notices ?? []).map((notice, index) => (
                <View key={notice.id}>
                  {index > 0 ? <Divider inset={space.lg} /> : null}
                  <NoticeRow
                    notice={notice}
                    distanceKm={distances.get(notice.id) ?? null}
                    onPress={open}
                  />
                </View>
              ))
              : null}
          </>
        ) : null}
      </ScreenScroll>
    </Screen>
  );
}
