// Search
//
// Search public notices by masjid, city, or a name the family chose to make public.
//
// Built in Phase 2. This screen exists now so the navigation, the safe areas
// and the theme can be exercised on a device before there is anything to
// fetch.

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { space } from '@/theme';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, gap: space.sm }}>
        <Text variant="title" serif>Search</Text>
        <Text variant="callout" tone="muted">Search public notices by masjid, city, or a name the family chose to make public.</Text>
      </View>
    </Screen>
  );
}
