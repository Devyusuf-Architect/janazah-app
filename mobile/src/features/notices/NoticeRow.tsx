// One notice, in a list.
//
// Deliberately not a card. The web app trimmed its feed cards to the
// essentials for the same reason (commit c1f63f7), and on a phone the pressure
// is stronger: a column of bordered, shadowed, rounded blocks fits three
// notices on a screen and reads as marketing. This is a row, with a hairline
// under it, and it shows five things:
//
//   the state, but only when it is not the ordinary one
//   the day and time, first and largest, because that is the question
//   who died, when the family made the name public
//   the masjid, with the verified mark
//   where, and how far, when the device knows
//
// Everything else, including the address, parking and the burial, is on the
// notice itself. A row that tries to be the notice is how a feed becomes
// unscannable.

import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { Badge } from '../../components/Badge';
import { useColors, space, radius, HIT_SLOP_MIN } from '../../theme';
import { formatNoticeTime, timeSentence, timeUntil } from '../../lib/time';
import { displayName, isCancelled, isCorrected, type Notice } from '../../lib/notice';
import { formatDistance } from '../../shared/geo';
import { whereLine } from '../../lib/search';

type Props = {
  notice: Notice;
  /** Kilometres from the reader, when location is on. Never sent anywhere. */
  distanceKm?: number | null;
  onPress: (notice: Notice) => void;
  verified?: boolean;
};

export function NoticeRow({ notice, distanceKm, onPress, verified = true }: Props) {
  const colors = useColors();
  const time = formatNoticeTime(notice);
  const soon = timeUntil(notice.janazahAt);
  const name = displayName(notice);
  const cancelled = isCancelled(notice);

  // Not simply the place name: a masjid usually prays at itself, so that is
  // very often the organization's name again, and the row would print the
  // same words twice.
  const where = whereLine(notice.orgName, notice.prayerLocation);

  // Read as one phrase rather than as six separate items, and led by the
  // state, because a cancellation announced last would be announced too late.
  const label = [
    cancelled ? 'Cancelled.' : isCorrected(notice) ? 'Updated.' : '',
    name ? `Janazah for ${name}.` : 'Janazah.',
    timeSentence(time) + '.',
    notice.orgName + (verified ? ', verified organization' : '') + '.',
    where,
    distanceKm != null ? `${formatDistance(distanceKm)} away` : '',
  ].filter(Boolean).join(' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the full notice"
      onPress={() => onPress(notice)}
      style={({ pressed }) => ({
        minHeight: HIT_SLOP_MIN,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: pressed ? colors.pressed : 'transparent',
      })}
    >
      <View
        // Hidden from the screen reader: the label above already says all of
        // this, and announcing it twice makes a list slow to move through.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: space.xs }}
      >
        {cancelled || isCorrected(notice) ? (
          <View style={{ flexDirection: 'row', marginBottom: 2 }}>
            <Badge
              tone={cancelled ? 'cancelled' : 'corrected'}
              label={cancelled ? 'Cancelled' : 'Updated'}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Text
            variant="bodyStrong"
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {time.day}
          </Text>
          <Text
            variant="bodyStrong"
            tone={cancelled ? 'subtle' : 'default'}
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {time.time}
          </Text>
          {time.zone ? (
            <Text variant="caption" tone="subtle">{time.zone}</Text>
          ) : null}
          {soon && !cancelled ? (
            <Text variant="caption" style={{ color: colors.accent }}>{soon}</Text>
          ) : null}
        </View>

        {time.label ? (
          <Text variant="caption" tone="subtle">{time.label}</Text>
        ) : null}

        {name ? (
          <Text variant="body" serif numberOfLines={1}>{name}</Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="callout" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {notice.orgName}
          </Text>
          {verified ? <VerifiedTick /> : null}
        </View>

        {where || distanceKm != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="caption" tone="subtle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {where}
            </Text>
            {distanceKm != null ? (
              <View
                style={{
                  paddingHorizontal: space.sm,
                  paddingVertical: 1,
                  borderRadius: radius.sm,
                  backgroundColor: colors.bgSunk,
                }}
              >
                <Text variant="caption" tone="subtle">{formatDistance(distanceKm)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The verified mark beside a masjid's name in a list.
 *
 * A tick, not the word, because the word is repeated on every row and becomes
 * furniture. The full wording is on the notice itself, and the row's
 * accessibility label above spells it out for a screen reader.
 */
function VerifiedTick() {
  const colors = useColors();
  return (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSoft,
        borderWidth: 1,
        borderColor: colors.accentLine,
      }}
    >
      <Text style={{ fontSize: 9, lineHeight: 12, color: colors.accent, fontWeight: '700' }}>
        {'✓'}
      </Text>
    </View>
  );
}
