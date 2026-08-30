// A single notice.
//
// This route exists in Phase 1 because it is the deep-link target: a
// notification tap and an Android App Link on https://taziyah.com/n/{id} both
// land here, and that path has to resolve before Phase 5 can be tested at
// all. The screen itself is built in Phase 2.

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { space } from '@/theme';

export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View
        style={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: space.lg,
          gap: space.md,
        }}
      >
        <Button
          label="Back"
          size="compact"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Text variant="title" serif>Janazah notice</Text>
        <Text variant="callout" tone="muted">
          The full notice is built in Phase 2. This route resolves now so that
          notification taps and links from taziyah.com can be tested.
        </Text>
        <Text variant="caption" tone="subtle">Notice {id}</Text>
      </View>
    </Screen>
  );
}
