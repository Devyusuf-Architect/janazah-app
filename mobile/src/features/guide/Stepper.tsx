// The four takbirs, as a stepper.
//
// This replaces an article. The previous version laid the whole guide out top
// to bottom, which is right for a web page somebody reads on a Tuesday
// afternoon and wrong for the moment it is actually opened: standing in a
// row, thirty seconds before the prayer, trying to remember what comes after
// the second takbir.
//
// So the four steps fit one screen. Each is a numbered disc, a label, and one
// line saying what is recited. Tapping one expands it in place with the
// Arabic, the transliteration, the meaning, the note where the schools differ
// and the source, and closes whichever was open before, so the screen never
// grows past a screenful plus one step.
//
// Nothing is cut. Every recitation, note and source that was on the page is
// still here; what changed is that they are one tap away instead of all at
// once. The material itself comes from public/js/janazah-guide-content.js
// unchanged, and this is a layout, not an edition.

import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, UIManager, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { Recitation } from './Recitation';
import { tapped } from '../../lib/haptics';
import { useColors, radius, space } from '../../theme';
import { motion, useReduceMotion } from '../../theme/motion';
import { TAKBIRS, QUICK_REFERENCE, type Takbir } from '../../shared/guide';

// Old-architecture Android needs this switched on before LayoutAnimation does
// anything. Harmless where it is already the default.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** The one-line summary for a takbir, from the guide's own quick reference. */
function summaryFor(number: number): string {
  return QUICK_REFERENCE[number - 1]?.[1] ?? '';
}

export function Stepper({ initiallyOpen = null }: {
  /** Only the design harness passes this. The app opens on a tap. */
  initiallyOpen?: number | null;
}) {
  const reduce = useReduceMotion();
  const [open, setOpen] = useState<number | null>(initiallyOpen);

  const toggle = (number: number) => {
    tapped();
    if (!reduce) {
      LayoutAnimation.configureNext({
        duration: motion.base,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: 'opacity' },
      });
    }
    setOpen((current) => (current === number ? null : number));
  };

  return (
    <View style={{ paddingHorizontal: space.lg }}>
      {TAKBIRS.map((takbir, index) => (
        <Step
          key={takbir.number}
          takbir={takbir}
          open={open === takbir.number}
          last={index === TAKBIRS.length - 1}
          onToggle={() => toggle(takbir.number)}
        />
      ))}
    </View>
  );
}

function Step({ takbir, open, last, onToggle }: {
  takbir: Takbir;
  open: boolean;
  last: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  const summary = summaryFor(takbir.number);

  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      {/* The rail: a numbered disc, and a line joining it to the next one.
          It is what makes four rows read as one sequence rather than as four
          unrelated settings. */}
      <View style={{ alignItems: 'center', width: 32 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: open ? colors.accent : colors.accentSoft,
            borderWidth: 1,
            borderColor: open ? colors.accent : colors.accentLine,
          }}
        >
          <Text
            variant="label"
            style={{
              color: open ? colors.onAccent : colors.accent,
              fontWeight: '700',
            }}
          >
            {takbir.number}
          </Text>
        </View>
        {!last ? (
          <View style={{ flex: 1, width: 2, backgroundColor: colors.line }} />
        ) : null}
      </View>

      <View style={{ flex: 1, paddingBottom: last ? 0 : space.lg }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${takbir.label}. ${summary}`}
          accessibilityHint={open
            ? 'Hides what to recite'
            : 'Shows what to recite, with the Arabic and its meaning'}
          onPress={onToggle}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingVertical: space.xs,
            paddingRight: space.sm,
            borderRadius: radius.md,
            backgroundColor: pressed ? colors.pressed : 'transparent',
          })}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{takbir.label}</Text>
            <Text variant="callout" tone="muted">{summary}</Text>
          </View>
          <Chevron open={open} color={colors.ink3} />
        </Pressable>

        {open ? (
          <View style={{ paddingTop: space.md, gap: space.lg }}>
            {/* The takbir call itself, on one line rather than in a full
                recitation block. It is two words everybody in the room is
                about to say out loud, and giving it the same box as the dua
                pushed the dua, which is what somebody opened this for, off
                the screen. Arabic, transliteration and meaning are all still
                here. */}
            {takbir.takbir ? <TakbirCall item={takbir.takbir} /> : null}
            {takbir.intro ? (
              <Text variant="body" tone="muted">{takbir.intro}</Text>
            ) : null}
            {takbir.recitations?.map((recitation, index) => (
              <Recitation key={recitation.title ?? index} item={recitation} />
            ))}
            {/* The dua genuinely differs when the deceased is a child.
                Dropping it for space would make the guide wrong rather than
                merely shorter, so it stays, inside the step it belongs to. */}
            {takbir.childNote ? (
              <Aside>
                {takbir.childNote.heading ? (
                  <Text variant="bodyStrong">{takbir.childNote.heading}</Text>
                ) : null}
                {takbir.childNote.body ? (
                  <Text variant="body">{takbir.childNote.body}</Text>
                ) : null}
                <Recitation item={takbir.childNote} />
              </Aside>
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
        ) : null}
      </View>
    </View>
  );
}

function TakbirCall({ item }: { item: NonNullable<Takbir['takbir']> }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: space.sm,
      }}
    >
      <Text
        accessibilityLanguage="ar"
        style={{ fontSize: 22, lineHeight: 38, color: colors.ink }}
      >
        {item.arabic}
      </Text>
      <Text variant="callout" tone="muted" style={{ fontStyle: 'italic' }}>
        {item.transliteration}
      </Text>
      <Text variant="callout" tone="subtle">{item.meaning}</Text>
    </View>
  );
}

function Aside({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View
      style={{
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.bgSunk,
        gap: space.md,
      }}
    >
      {children}
    </View>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d={open ? 'm6 14.5 6-6 6 6' : 'm6 9.5 6 6 6-6'}
        stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </Svg>
  );
}
