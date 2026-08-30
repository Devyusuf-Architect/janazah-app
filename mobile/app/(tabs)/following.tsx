// Following
//
// Verified masjids you follow, and their upcoming notices.
//
// Built in Phase 4. This screen exists now so the navigation, the safe areas
// and the theme can be exercised on a device before there is anything to
// fetch.

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { space } from '@/theme';

export default function FollowingScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, gap: space.sm }}>
        <Text variant="title" serif>Following</Text>
        <Text variant="callout" tone="muted">Verified masjids you follow, and their upcoming notices.</Text>
      </View>
    </Screen>
  );
}
