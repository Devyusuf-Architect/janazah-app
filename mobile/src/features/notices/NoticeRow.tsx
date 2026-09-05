// One notice, in a list.
//
// Three lines, and it is not a card. A column of bordered, shadowed, rounded
// blocks fits three notices on a screen and reads as marketing; the web app
// trimmed its feed cards for the same reason (commit c1f63f7).
//
// The three lines, in the order somebody actually reads them:
//
//   the day and the time, with the state when it is not the ordinary one
//   who died, when the family made the name public
//   the masjid, where, and how far, on one line
//
// Everything else, including the address, parking and the burial, is on the
// notice itself. A row that tries to be the notice is how a feed becomes
// unscannable.
//
// The earlier version put the masjid, the place and the distance on separate
// lines with the time label between them, which made a row five lines tall
// and a screenful three notices long.

import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
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
  const corrected = isCorrected(notice);

  // Not simply the place name: a masjid usually prays at itself, so that is
  // very often the organization's name again, and the row would print the
  // same words twice.
  const where = whereLine(notice.orgName, notice.prayerLocation);

  // Read as one phrase rather than as six separate items, and led by the
  // state, because a cancellation announced last would be announced too late.
  const label = [
    cancelled ? 'Cancelled.' : corrected ? 'Updated.' : '',
    name ? `Janazah for ${name}.` : 'Janazah.',
    timeSentence(time) + '.',
    notice.orgName + (verified ? ', verified organization' : '') + '.',
    where,
    distanceKm != null ? `${formatDistance(distanceKm)} away` : '',
  ].filter(Boolean).join(' ');

  const struck = cancelled
    ? { textDecorationLine: 'line-through' as const }
    : undefined;

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
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          {/* The time and its qualifiers wrap as a group. On a 320dp phone
              "Today 1:30 p.m." and "after Dhuhr" do not fit on one line
              beside a status, and clipping the masjid's own words for the
              time is worse than letting them fall to a second line. */}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: space.sm,
            }}
          >
            <Text variant="bodyStrong" style={struck}>{time.day}</Text>
            <Text
              variant="bodyStrong"
              tone={cancelled ? 'subtle' : 'default'}
              style={struck}
            >
              {time.time}
            </Text>
            {time.zone ? (
              <Text variant="caption" tone="subtle">{time.zone}</Text>
            ) : null}
            {time.label && !cancelled ? (
              <Text variant="caption" tone="subtle">{time.label}</Text>
            ) : null}
          </View>

          {/* The state sits at the end of the time line rather than on a row
              of its own above it. It is still the first thing announced to a
              screen reader, and it no longer costs the list a line per
              changed notice. */}
          {cancelled || corrected ? (
            <Tag
              text={cancelled ? 'Cancelled' : 'Updated'}
              fg={cancelled ? colors.danger : colors.gold}
              bg={cancelled ? colors.dangerSoft : colors.goldSoft}
              border={cancelled ? colors.dangerLine : colors.goldLine}
            />
          ) : soon ? (
            <Text variant="caption" style={{ color: colors.accent }}>{soon}</Text>
          ) : null}
        </View>

        {name ? (
          <Text variant="body" serif numberOfLines={1}>{name}</Text>
        ) : null}

        {/* Masjid, place and distance on one line that never wraps. The
            distance is pinned to the end and does not shrink: it is three
            characters, and letting it break onto a second line to save a
            truncated street name is the wrong trade. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          {verified ? <VerifiedTick /> : null}
          <Text
            variant="caption"
            tone="subtle"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {[notice.orgName, where].filter(Boolean).join(' · ')}
          </Text>
          {distanceKm != null ? (
            <Text variant="caption" tone="subtle">
              {formatDistance(distanceKm)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function Tag({ text, fg, bg, border }: {
  text: string; fg: string; bg: string; border: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: space.sm,
        paddingVertical: 1,
        borderRadius: radius.sm,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text variant="caption" style={{ color: fg, fontWeight: '600' }}>{text}</Text>
    </View>
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
        width: 13,
        height: 13,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentSoft,
        borderWidth: 1,
        borderColor: colors.accentLine,
      }}
    >
      <Text style={{ fontSize: 8, lineHeight: 11, color: colors.accent, fontWeight: '700' }}>
        {'✓'}
      </Text>
    </View>
  );
}
