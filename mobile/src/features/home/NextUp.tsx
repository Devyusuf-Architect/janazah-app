// The next Janazah.
//
// The one thing on Home given any size, and the only card on the screen. It
// answers, in order and without scrolling: when, who, where, how far, and how
// do I get there.
//
// The whole card opens the notice, so there is no "Open notice" button
// competing with the one action that matters. Directions is the single
// primary control on Home, which is the point: a person looking at this is
// usually deciding whether they can get there in time, not browsing.
//
// Cancelled notices never reach this card. Home picks the soonest notice that
// is not cancelled, because a cancellation belongs in the section that says
// so, not under a heading that says what is happening next.

import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { formatNoticeTime, timeSentence, timeUntil } from '../../lib/time';
import { tapped } from '../../lib/haptics';
import { displayName, isCorrected, type Notice } from '../../lib/notice';
import { whereLine } from '../../lib/search';
import { formatDistance, type MapDestination } from '../../shared/geo';
import { useColors, radius, space, elevation } from '../../theme';

export function NextUp({ notice, distanceKm, onPress, onDirections }: {
  notice: Notice;
  distanceKm?: number | null;
  onPress: (notice: Notice) => void;
  /** Opens the maps-app sheet. The same one the notice screen uses. */
  onDirections: (place: MapDestination) => void;
}) {
  const colors = useColors();
  const time = formatNoticeTime(notice);
  const soon = timeUntil(notice.janazahAt);
  const name = displayName(notice);
  const where = whereLine(notice.orgName, notice.prayerLocation);
  const place = notice.prayerLocation;
  const hasPlace = !!(place?.address || place?.lat != null);

  const label = [
    'Next Janazah.',
    name ? `For ${name}.` : '',
    timeSentence(time) + '.',
    notice.orgName + '.',
    distanceKm != null ? `${formatDistance(distanceKm)} away.` : '',
  ].filter(Boolean).join(' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the full notice"
      onPress={() => onPress(notice)}
      style={({ pressed }) => ({
        borderRadius: radius.lg,
        backgroundColor: pressed ? colors.pressed : colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        padding: space.lg,
        gap: space.md,
        ...elevation.raised,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ gap: space.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase', flex: 1 }}>
            Next Janazah
          </Text>
          {isCorrected(notice) ? <Badge tone="corrected" label="Updated" /> : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.sm }}>
          <Text variant="timeLarge" serif>{time.day}</Text>
          <Text variant="timeLarge" serif style={{ color: colors.accent }}>
            {time.time}
          </Text>
          {time.zone ? <Text variant="caption" tone="subtle">{time.zone}</Text> : null}
          {soon ? (
            <Text variant="caption" style={{ color: colors.accent }}>{soon}</Text>
          ) : null}
        </View>

        {name ? (
          <Text variant="title" serif numberOfLines={1}>{name}</Text>
        ) : null}

        {/* Masjid, place and distance on one line. Three lines of metadata
            under a time is how this card started looking like a document. */}
        <Text variant="callout" tone="muted" numberOfLines={2}>
          {[
            notice.orgName,
            where,
            distanceKm != null ? formatDistance(distanceKm) : '',
          ].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {hasPlace ? (
        <Button
          label="Directions"
          kind="primary"
          full
          onPress={() => { tapped(); onDirections(place); }}
          accessibilityLabel="Directions to the prayer location, in your maps app"
        />
      ) : null}
    </Pressable>
  );
}
