// The Janazah guide.
//
// One screen, and the four takbirs are on it without scrolling. Everything
// else is a tap away.
//
// The previous version was an article: every recitation, every note, both
// schools' positions and four sections of prose, laid out top to bottom. That
// is the right shape for a web page and the wrong shape for the moment this
// screen is actually opened, which is standing in a row thirty seconds before
// the prayer, trying to remember what comes after the second takbir. Somebody
// in that position cannot scroll through two thousand words.
//
// So: the four takbirs as a stepper, first and above the fold; the istirja
// under them; and four rows leading to what used to sit below. Nothing was
// cut. Every recitation, note, source and disclaimer that was on the page is
// still in the app, reachable in one tap instead of by scrolling past it.
//
// Everything comes from public/js/janazah-guide-content.js through
// src/shared/guide.ts, unchanged. Read that file's own header before touching
// anything: it is religious text people read moments before praying over
// someone who has died, every recitation carries its source, nothing is
// paraphrased, and where the schools of law differ both are shown. This is a
// layout, not an edition.

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Text } from '../../components/Text';
import { Row } from '../../components/Row';
import { Surface, Divider } from '../../components/Surface';
import { Stepper } from './Stepper';
import { ISTIRJA } from '../../shared/guide';
import { useColors, arabic, radius, space } from '../../theme';

export function GuideBody() {
  const colors = useColors();

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <Text variant="caption" tone="subtle">
          Follow your imam. Tap a takbir for what to recite.
        </Text>
      </View>

      <Stepper />

      {/* On hearing the news.
          Below the takbirs rather than above them, which is the one place
          this layout departs from the order of the source. The istirja is
          said when the news reaches you, usually hours earlier and somewhere
          else; the takbirs are what somebody needs in the ten seconds before
          the prayer. Putting a card above them pushed the fourth step off the
          screen, and the fourth step is the whole point. */}
      <View style={{ paddingHorizontal: space.lg }}>
        <View
          style={{
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentLine,
            gap: space.sm,
          }}
        >
          <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
            On hearing the news
          </Text>
          <Text
            accessibilityLanguage="ar"
            style={{
              fontSize: arabic.body.fontSize,
              lineHeight: arabic.body.lineHeight,
              color: colors.ink,
              writingDirection: 'rtl',
              textAlign: 'right',
            }}
          >
            {ISTIRJA.arabic}
          </Text>
          <Text variant="callout" tone="muted" style={{ fontStyle: 'italic' }}>
            {ISTIRJA.transliteration}
          </Text>
          <Text variant="callout">{ISTIRJA.english}</Text>
        </View>
      </View>


      {/* What used to be four more sections of prose. Each opens its own
          screen, so the guide's front page stays the thing somebody can read
          in the ten seconds they have. */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <Surface style={{ overflow: 'hidden' }}>
          <Row
            title="Before the prayer"
            subtitle="Rows, position, and the intention"
            onPress={() => router.push('/guide/before')}
          />
          <Divider inset={space.lg} />
          <Row
            title="After the prayer"
            subtitle="The funeral, the burial, and consoling the family"
            onPress={() => router.push('/guide/after')}
          />
          <Divider inset={space.lg} />
          <Row
            title="One dua, four endings"
            subtitle="Praying for a man, a woman, or more than one person"
            onPress={() => router.push('/guide/endings')}
          />
          <Divider inset={space.lg} />
          <Row
            title="Sources and the schools of law"
            subtitle="Where they differ, and what this guide is not"
            onPress={() => router.push('/guide/sources')}
          />
        </Surface>
      </View>
    </View>
  );
}
