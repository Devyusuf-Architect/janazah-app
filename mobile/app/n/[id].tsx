// A single notice.
//
// The route: loading, errors, and the deep-link contract. The screen itself is
// src/features/notices/NoticeDetail.tsx, which is where the design lives and
// which the harness in preview/ can render without Firebase.
//
// This is the target of an Android App Link on https://taziyah.com/n/{id} and
// of a notification tap, so it has to resolve for an id it has never seen and
// give a sensible answer when the notice has gone.

import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { Button } from '../../src/components/Button';
import { Loading, ErrorState, StaleBanner } from '../../src/components/States';
import { NoticeDetail } from '../../src/features/notices/NoticeDetail';
import { DirectionsSheet } from '../../src/features/notices/DirectionsSheet';
import { useNotice, useOrganization } from '../../src/lib/queries';
import { isVerified, type Place } from '../../src/lib/notice';
import { space } from '../../src/theme';

export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data, isPending, isError, refetch } = useNotice(id);
  const notice = data?.notice ?? null;
  const { data: org } = useOrganization(notice?.orgId);

  const [destination, setDestination] = useState<Place | null>(null);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Janazah notice' }} />
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.md }}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Button
            label="Back"
            size="compact"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>

        {isPending ? <Loading label="Loading this notice" /> : null}

        {isError ? (
          <View style={{ paddingHorizontal: space.lg }}>
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
          <View style={{ paddingHorizontal: space.lg }}>
            <ErrorState
              message={
                'This notice is no longer available. The deceased’s name is '
                + 'removed from a notice some weeks after the prayer.'
              }
            />
          </View>
        ) : null}

        {notice ? (
          <>
            {data?.stale ? <StaleBanner onRetry={refetch} /> : null}
            <NoticeDetail
              notice={notice}
              verified={isVerified(org)}
              onDirections={setDestination}
              onReport={() => router.push(`/report/${notice.id}`)}
            />
          </>
        ) : null}
      </ScreenScroll>

      <DirectionsSheet
        destination={destination}
        onClose={() => setDestination(null)}
      />
    </Screen>
  );
}
