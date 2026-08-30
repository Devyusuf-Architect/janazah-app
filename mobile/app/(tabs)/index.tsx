// Home.
//
// Phase 1 puts the frame in place: the greeting, the search field and the
// section headings that Phase 2 fills with real notices. Nothing here fetches
// yet, and the placeholders say so rather than pretending to be an empty
// feed, because "no Janazahs today" and "this is not built yet" must never
// look the same in an app like this one.

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Surface } from '@/components/Surface';
import { Greeting } from '@/features/home/Greeting';
import { SearchField } from '@/features/home/SearchField';
import { SectionHeader } from '@/features/home/SectionHeader';
import { space } from '@/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.md }}>
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Greeting />
          <SearchField />
        </View>

        <SectionHeader title="Upcoming" />
        <Placeholder note="Upcoming Janazahs appear here." />

        <SectionHeader title="Near you" />
        <Placeholder note="Janazahs close to you appear here once location is on." />

        <SectionHeader title="Masjids you follow" />
        <Placeholder note="Notices from masjids you follow appear here." />
      </ScreenScroll>
    </Screen>
  );
}

function Placeholder({ note }: { note: string }) {
  return (
    <Surface
      padded
      style={{ marginHorizontal: space.lg, marginTop: space.sm }}
    >
      <Text variant="callout" tone="muted">{note}</Text>
    </Surface>
  );
}
