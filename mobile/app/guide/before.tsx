// Before the prayer.
//
// One of four screens carrying what used to sit below the takbirs on a single
// long page: the rows, the position, and the intention. Reached from the
// guide's front page, so somebody who opened the app thirty seconds before
// the prayer never scrolls past it to reach the thing they need.
//
// The text is public/js/janazah-guide-content.js unchanged, through
// src/shared/guide.ts. This is a layout, not an edition.

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { Surface } from '../../src/components/Surface';
import { STEPS, type Pair } from '../../src/shared/guide';
import { space } from '../../src/theme';

export default function GuideBeforeScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Before the prayer' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Before the prayer" />
        <View style={{ paddingHorizontal: space.lg, gap: space.xl }}>
          {STEPS.map((step) => (
            <View key={step.number} style={{ gap: space.md }}>
              <Text variant="heading">{step.title}</Text>
              {step.lede ? (
                <Text variant="body" tone="muted">{step.lede}</Text>
              ) : null}
              {step.body ? <Text variant="body">{step.body}</Text> : null}
              {step.points?.map((point: Pair) => (
                <View key={point[0]} style={{ gap: 2 }}>
                  <Text variant="bodyStrong">{point[0]}</Text>
                  <Text variant="body" tone="muted">{point[1]}</Text>
                </View>
              ))}
              {step.aside ? (
                <Surface padded level="flat">
                  <Text variant="callout" tone="muted">{step.aside}</Text>
                </Surface>
              ) : null}
            </View>
          ))}
        </View>
      </ScreenScroll>
    </Screen>
  );
}
