// The Janazah guide's content, as a screen.
//
// Separated from the route so the design harness can render it (see
// preview/entry.tsx). Everything here comes from
// public/js/janazah-guide-content.js through src/shared/guide.ts, unchanged.
// Read that file's own header before touching anything: it is religious text
// people read moments before praying over someone who has died, every
// recitation carries its source, nothing is paraphrased, and where the
// schools of law differ both are shown.
//
// This is a layout, not an edition. Nothing here edits, shortens, reorders or
// adds to any of it.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Surface, Divider } from '../../components/Surface';
import { Recitation } from './Recitation';
import {
  STEPS, TAKBIRS, PRONOUN_NOTE, QUICK_REFERENCE, AFTER, ISTIRJA,
  SCHOOLS_NOTE, SCOPE_NOTE,
  type Pair,
} from '../../shared/guide';
import { useColors, radius, space } from '../../theme';

export function GuideBody() {
  const colors = useColors();

  return (
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>

          <View style={{ gap: space.sm }}>
            <Text variant="display" serif>How to pray Salat al-Janazah</Text>
            <Text variant="callout" tone="muted">
              A reminder for anyone who has not prayed one before. Follow your
              imam; the details below differ between the schools of law, and
              both are shown where they do.
            </Text>
          </View>

          {/* When somebody dies, or when the news reaches you. First because
              it is the first thing anyone says. */}
          <Section title="On hearing the news">
            <Recitation item={ISTIRJA} size="large" />
          </Section>

          <Section title="The four takbirs, in short">
            <Surface style={{ overflow: 'hidden' }}>
              {QUICK_REFERENCE.map((pair: Pair, index: number) => (
                <View key={pair[0]}>
                  {index > 0 ? <Divider inset={space.lg} /> : null}
                  <View style={{ padding: space.lg, gap: 2 }}>
                    <Text variant="bodyStrong">{pair[0]}</Text>
                    <Text variant="callout" tone="muted">{pair[1]}</Text>
                  </View>
                </View>
              ))}
            </Surface>
          </Section>

          <Section title="Before the prayer">
            {STEPS.map((step) => (
              <View key={step.number} style={{ gap: space.md }}>
                <Text variant="heading">{`${step.number}. ${step.title}`}</Text>
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
          </Section>

          <Section title="The prayer">
            {TAKBIRS.map((takbir) => (
              <View key={takbir.number} style={{ gap: space.md }}>
                <Text variant="heading">
                  {`${takbir.number}. ${takbir.label}`}
                </Text>
                {takbir.takbir ? (
                  <Recitation item={takbir.takbir} />
                ) : null}
                {takbir.intro ? (
                  <Text variant="body" tone="muted">{takbir.intro}</Text>
                ) : null}
                {takbir.recitations?.map((recitation, index) => (
                  <Recitation key={recitation.title ?? index} item={recitation} />
                ))}
                {takbir.childNote ? (
                  <Surface padded level="flat" style={{ gap: space.md }}>
                    {takbir.childNote.heading ? (
                      <Text variant="bodyStrong">{takbir.childNote.heading}</Text>
                    ) : null}
                    {takbir.childNote.body ? (
                      <Text variant="body">{takbir.childNote.body}</Text>
                    ) : null}
                    <Recitation item={takbir.childNote} />
                  </Surface>
                ) : null}
                {takbir.closing ? (
                  <View style={{ gap: space.md }}>
                    {takbir.closing.heading ? (
                      <Text variant="bodyStrong">{takbir.closing.heading}</Text>
                    ) : null}
                    {takbir.closing.body ? (
                      <Text variant="body">{takbir.closing.body}</Text>
                    ) : null}
                    <Recitation item={takbir.closing} />
                  </View>
                ) : null}
              </View>
            ))}
          </Section>

          <Section title={PRONOUN_NOTE.heading}>
            <Text variant="body">{PRONOUN_NOTE.body}</Text>
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
          </Section>

          <Section title={AFTER.heading}>
            {AFTER.body ? <Text variant="body">{AFTER.body}</Text> : null}
            {AFTER.points?.map((point: Pair) => (
              <View key={point[0]} style={{ gap: 2 }}>
                <Text variant="bodyStrong">{point[0]}</Text>
                <Text variant="body" tone="muted">{point[1]}</Text>
              </View>
            ))}
          </Section>

          {/* Both of these stay, in full, on a phone. The first says the
              schools of law differ; the second says Ta'ziyah is a
              notification service and not a religious authority. Cutting
              either for space would make the guide dishonest rather than
              merely shorter. */}
          <View
            style={{
              padding: space.lg,
              borderRadius: radius.lg,
              backgroundColor: colors.bgSunk,
              gap: space.md,
            }}
          >
            <Text variant="callout" tone="muted">{SCHOOLS_NOTE}</Text>
            <Text variant="callout" tone="muted">{SCOPE_NOTE}</Text>
          </View>
        </View>
  );
}

function Section({ title, children }: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: space.md, paddingTop: space.md }}>
      <Text
        variant="overline"
        tone="subtle"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase' }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
