// One dua, four endings.
//
// Which ending the dua for the deceased takes: a man, a woman, or more than
// one person. It is a table, and a table is exactly the kind of thing that
// makes a page long without being read, so it moved off the guide's front
// page and onto its own screen.
//
// The text is public/js/janazah-guide-content.js unchanged, through
// src/shared/guide.ts. This is a layout, not an edition.

import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { Surface, Divider } from '../../src/components/Surface';
import { PRONOUN_NOTE, type Pair } from '../../src/shared/guide';
import { useColors, space } from '../../src/theme';

export default function GuideEndingsScreen() {
  const colors = useColors();

  return (
    <Screen>
      <Stack.Screen options={{ title: PRONOUN_NOTE.heading }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title={PRONOUN_NOTE.heading} subtitle={PRONOUN_NOTE.body} />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Surface style={{ overflow: 'hidden' }}>
            {PRONOUN_NOTE.forms.map((form: Pair, index: number) => (
              <View key={form[0]}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: space.lg,
                    gap: space.md,
                  }}
                >
                  <Text variant="body" style={{ flex: 1 }}>{form[0]}</Text>
                  <Text variant="body" tone="muted" style={{ fontStyle: 'italic' }}>
                    {form[1]}
                  </Text>
                  <Text
                    accessibilityLanguage="ar"
                    style={{
                      fontSize: 22,
                      lineHeight: 40,
                      color: colors.ink,
                      writingDirection: 'rtl',
                    }}
                  >
                    {form[2]}
                  </Text>
                </View>
              </View>
            ))}
          </Surface>
          <Text variant="callout" tone="muted">{PRONOUN_NOTE.footnote}</Text>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
