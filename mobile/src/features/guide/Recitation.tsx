// A recitation: Arabic, transliteration, meaning, source.
//
// This is the component the whole guide screen exists for, and the one place
// in the app where the type is set larger than anywhere else on purpose.
// Somebody reads this standing up, often in poor light, moments before
// praying over a person who has died, and frequently on a phone held at
// arm's length. Naskh needs the room, so the Arabic is set at 28pt with 52pt
// of leading and is never truncated, never scaled to fit, and never put
// behind a "show more".
//
// The order is fixed: Arabic, then transliteration, then meaning, then
// source. Somebody who can read Arabic never has to look past the first
// line, and somebody who cannot gets a pronunciation before a translation,
// which is the order in which they will need them.
//
// The text itself comes from public/js/janazah-guide-content.js unchanged.
// Read the header of that file before touching anything here: every
// recitation carries its source, nothing is paraphrased, and where the
// schools of law differ both are shown. This component is a layout, not an
// edition.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { useColors, arabic, radius, space } from '../../theme';
import type { Recitation as RecitationType } from '../../shared/guide';

export function Recitation({ item, size = 'body' }: {
  item: RecitationType;
  size?: 'body' | 'large';
}) {
  const colors = useColors();
  const scale = size === 'large' ? arabic.large : arabic.body;

  return (
    <View style={{ gap: space.md }}>
      {item.title ? (
        <Text variant="heading">{item.title}</Text>
      ) : null}

      {item.note ? (
        <Text variant="callout" tone="muted">{item.note}</Text>
      ) : null}

      {item.arabic ? (
        <View
          style={{
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text
            // Right to left, and marked as Arabic so a screen reader uses an
            // Arabic voice rather than spelling it out in English.
            accessibilityLanguage="ar"
            style={{
              fontSize: scale.fontSize,
              lineHeight: scale.lineHeight,
              color: colors.ink,
              writingDirection: 'rtl',
              textAlign: 'right',
            }}
          >
            {item.arabic}
          </Text>
        </View>
      ) : null}

      {item.transliteration ? (
        <Text
          variant="body"
          tone="muted"
          style={{ fontStyle: 'italic' }}
        >
          {item.transliteration}
        </Text>
      ) : null}

      {item.meaning ? (
        <Text variant="body">{item.meaning}</Text>
      ) : null}

      {item.source ? (
        <Text variant="caption" tone="subtle">{item.source}</Text>
      ) : null}
    </View>
  );
}
