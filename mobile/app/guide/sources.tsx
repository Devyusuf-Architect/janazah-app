// Sources, and what this guide is not.
//
// Two statements, both in full and neither edited. The first says the schools
// of law differ and that this guide shows both where they do. The second says
// Ta'ziyah is a notification service and not a religious authority.
//
// They moved off the guide's front page with everything else, and that is the
// only change: cutting either for space would make the guide dishonest rather
// than merely shorter, and neither is behind anything harder to reach than
// one tap from the guide itself.
//
// The text is public/js/janazah-guide-content.js unchanged, through
// src/shared/guide.ts.

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { FadeInView } from '../../src/components/Motion';
import { SCHOOLS_NOTE, SCOPE_NOTE } from '../../src/shared/guide';
import { space } from '../../src/theme';

export default function GuideSourcesScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Sources' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Sources and the schools of law" />
        <FadeInView style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Text variant="body">{SCHOOLS_NOTE}</Text>
          <Text variant="body">{SCOPE_NOTE}</Text>
          <Text variant="callout" tone="muted">
            Each recitation in the prayer carries its own source, shown with it
            when you open that takbir.
          </Text>
        </FadeInView>
      </ScreenScroll>
    </Screen>
  );
}
