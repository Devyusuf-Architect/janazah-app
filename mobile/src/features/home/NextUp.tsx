// The next Janazah.
//
// The one thing on Home given any size, and it is still not a giant card: it
// is a row's worth of information laid out so the time is unmissable, on a
// raised surface, with the two actions somebody standing in a hallway
// actually wants.
//
// The time is the largest text in the app. Everything about the layout is in
// service of somebody reading it at arm's length while being handed a coat.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Surface } from '../../components/Surface';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { formatNoticeTime, timeSentence, timeUntil } from '../../lib/time';
import { displayName, isCorrected, type Notice } from '../../lib/notice';
import { whereLine } from '../../lib/search';
import { formatDistance, type MapDestination } from '../../shared/geo';
import { space, useColors } from '../../theme';

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

  return (
    <Surface level="raised" padded style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
          Next Janazah
        </Text>
        {isCorrected(notice) ? <Badge tone="corrected" label="Updated" /> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Text variant="timeLarge">{time.day}</Text>
        <Text variant="timeLarge" style={{ color: colors.accent }}>{time.time}</Text>
        {time.zone ? <Text variant="caption" tone="subtle">{time.zone}</Text> : null}
      </View>

      {time.label || soon ? (
        <Text variant="callout" tone="muted">
          {[time.label, soon].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      {name ? <Text variant="title" serif numberOfLines={2}>{name}</Text> : null}

      <View style={{ gap: 2 }}>
        <Text variant="body" numberOfLines={1}>{notice.orgName}</Text>
        {where ? (
          <Text variant="callout" tone="muted" numberOfLines={2}>
            {where}
            {distanceKm != null ? ` · ${formatDistance(distanceKm)} away` : ''}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.xs }}>
        <Button
          label="Open notice"
          kind="primary"
          size="compact"
          onPress={() => onPress(notice)}
          accessibilityLabel={`Open the notice. ${timeSentence(time)}`}
        />
        {place?.address || place?.lat != null ? (
          <Button
            label="Directions"
            size="compact"
            onPress={() => onDirections(place)}
            accessibilityLabel="Directions to the prayer location, in your maps app"
          />
        ) : null}
      </View>
    </Surface>
  );
}
