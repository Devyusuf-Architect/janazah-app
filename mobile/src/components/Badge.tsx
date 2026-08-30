// Small status marks.
//
// The verified badge is the one that carries weight, and its wording is
// deliberate: it means the *organization* was verified by a platform
// administrator, never that anyone checked this particular notice. The web
// app makes the same distinction (commit b134012) and the two must not drift,
// because the difference is the whole trust model.

import React from 'react';
import { View } from 'react-native';

import { useColors, radius, space } from '@/theme';
import { Text } from './Text';

type Tone = 'verified' | 'cancelled' | 'corrected' | 'neutral';

export function Badge({ tone, label }: { tone: Tone; label: string }) {
  const colors = useColors();

  const palette = {
    verified: { bg: colors.accentSoft, border: colors.accentLine, fg: colors.accent },
    cancelled: { bg: colors.dangerSoft, border: colors.dangerLine, fg: colors.danger },
    corrected: { bg: colors.goldSoft, border: colors.goldLine, fg: colors.gold },
    neutral: { bg: colors.surfaceAlt, border: colors.line, fg: colors.ink2 },
  }[tone];

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: space.sm,
        paddingVertical: 2,
        borderRadius: radius.sm,
        borderWidth: 1,
        backgroundColor: palette.bg,
        borderColor: palette.border,
      }}
    >
      <Text variant="caption" style={{ color: palette.fg, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The verified mark as it appears beside a masjid's name.
 *
 * Given an explicit accessibility label because the visual is a short word
 * next to a name, and a screen reader announcing only "Verified" leaves the
 * ambiguity the wording exists to remove.
 */
export function VerifiedBadge() {
  return (
    <View
      accessible
      accessibilityLabel="Verified organization, checked by a Ta’ziyah administrator"
    >
      <Badge tone="verified" label="Verified" />
    </View>
  );
}
