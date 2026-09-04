// A single notice.
//
// The route: loading, errors, the connection state, and the deep-link
// contract. The screen itself is src/features/notices/NoticeDetail.tsx, which
// is where the design lives and which the harness in preview/ can render
// without Firebase.
//
// This is the target of an Android App Link on https://taziyah.com/n/{id} and
// of a notification tap, so it has to resolve for an id it has never seen,
// open with nowhere to go back to, and give a sensible answer when the notice
// has gone.

import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, HeaderAction } from '../../src/components/ScreenHeader';
import { ErrorState } from '../../src/components/States';
import { NoticeSkeleton } from '../../src/components/Skeleton';
import {
  ConnectionBanner, SlowNotice, useSlowLoad,
} from '../../src/components/Connection';
import { FadeInView } from '../../src/components/Motion';
import { NoticeDetail, shareNotice } from '../../src/features/notices/NoticeDetail';
import { DirectionsSheet } from '../../src/features/notices/DirectionsSheet';
import { useNotice, useOrganization } from '../../src/lib/queries';
import { connectionOf } from '../../src/lib/connectivity';
import { isVerified, type Place } from '../../src/lib/notice';
import { space, useColors } from '../../src/theme';

export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const { data, isPending, isError, refetch } = useNotice(id);
  const notice = data?.notice ?? null;
  const { data: org } = useOrganization(notice?.orgId);
  const slow = useSlowLoad(isPending);

  const [destination, setDestination] = useState<Place | null>(null);

  const connection = connectionOf({
    isPending, isError, fromCache: data?.stale ?? false, hasContent: !!notice,
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Janazah notice' }} />

      <ScreenHeader
        right={notice ? (
          <HeaderAction label="Share this notice" onPress={() => shareNotice(notice)}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M12 15V4m0 0L8.2 7.8M12 4l3.8 3.8"
                stroke={colors.ink} strokeWidth={1.8}
                strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
              <Path
                d="M5.5 13v5.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V13"
                stroke={colors.ink} strokeWidth={1.8}
                strokeLinecap="round" strokeLinejoin="round" fill="none"
              />
            </Svg>
          </HeaderAction>
        ) : undefined}
      />

      <ScreenScroll>
        <ConnectionBanner connection={connection} onRetry={refetch} />

        {isPending ? (
          <>
            <View style={{ paddingTop: space.md }}>
              <NoticeSkeleton />
              <NoticeSkeleton />
            </View>
            {slow ? <SlowNotice onRetry={refetch} /> : null}
          </>
        ) : null}

        {connection === 'unreachable' ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
            <ErrorState
              message={
                'This notice could not be loaded. You may be offline, or the '
                + 'link may be out of date.'
              }
              onRetry={refetch}
            />
          </View>
        ) : null}

        {!isPending && !isError && !notice ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
            <ErrorState
              message={
                'This notice is no longer available. The deceased’s name is '
                + 'removed from a notice some weeks after the prayer.'
              }
            />
          </View>
        ) : null}

        {notice ? (
          <FadeInView style={{ paddingTop: space.md }}>
            <NoticeDetail
              notice={notice}
              verified={isVerified(org)}
              onDirections={setDestination}
              onReport={() => router.push(`/report/${notice.id}`)}
            />
          </FadeInView>
        ) : null}
      </ScreenScroll>

      <DirectionsSheet
        destination={destination}
        onClose={() => setDestination(null)}
      />
    </Screen>
  );
}
