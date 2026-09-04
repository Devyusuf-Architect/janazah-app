// After the prayer.
//
// The funeral, the burial, the dua after burial, and consoling the family.
// One of the four screens the guide's long-form material moved to when the
// front page became a stepper.
//
// The text is public/js/janazah-guide-content.js unchanged, through
// src/shared/guide.ts. This is a layout, not an edition.

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { AFTER, type Pair } from '../../src/shared/guide';
import { space } from '../../src/theme';

export default function GuideAfterScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: AFTER.heading }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title={AFTER.heading} />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          {AFTER.body ? <Text variant="body">{AFTER.body}</Text> : null}
          {AFTER.points?.map((point: Pair) => (
            <View key={point[0]} style={{ gap: space.xs }}>
              <Text variant="bodyStrong">{point[0]}</Text>
              <Text variant="body" tone="muted">{point[1]}</Text>
            </View>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
