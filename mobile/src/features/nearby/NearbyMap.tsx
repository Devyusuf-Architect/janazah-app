// The map.
//
// Pins are public prayer locations, taken from notices anyone can read. There
// is no pin for the reader beyond the blue dot Android draws itself, which is
// rendered by the system from the device's own fix and is never a coordinate
// this app has written down or sent anywhere.
//
// The map needs a Google Maps API key in the Android build. Without one the
// tiles render blank, which reads as a broken app rather than a missing key,
// so `mapAvailable` gates the whole feature and the List/Map toggle is hidden
// until the key is configured. scripts/preflight.mjs says so.

import React, { useMemo, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Constants from 'expo-constants';

import { Text } from '../../components/Text';
import { useColors, space } from '../../theme';
import { formatNoticeTime } from '../../lib/time';
import { displayName, isCancelled, type Notice } from '../../lib/notice';
import type { Nearby, Point } from '../../lib/nearby';

/** Whether a Maps key was configured for this build. */
export const mapAvailable = (): boolean =>
  String(Constants.expoConfig?.extra?.googleMapsApiKey ?? '').length > 0;

/** Degrees of latitude per kilometre, near enough for framing a map. */
const KM_TO_DEGREES = 1 / 110.574;

/**
 * A region that holds the reader and the notices shown.
 *
 * Framed on the results rather than fixed at the radius, because a 50 km
 * radius with everything inside 4 km of the reader should not open zoomed out
 * over farmland.
 */
export function regionFor(from: Point, results: Nearby[], radiusKm: number): Region {
  const points = results
    .map((r) => r.notice.prayerLocation)
    .filter((p): p is NonNullable<typeof p> =>
      !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng));

  if (!points.length) {
    const span = Math.max(2, (radiusKm || 25)) * KM_TO_DEGREES * 2.4;
    return {
      latitude: from.lat, longitude: from.lng,
      latitudeDelta: span, longitudeDelta: span,
    };
  }

  const lats = [from.lat, ...points.map((p) => p.lat)];
  const lngs = [from.lng, ...points.map((p) => p.lng)];
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // A floor on the span, so a single pin two streets away does not open at
  // maximum zoom on one rooftop.
  const pad = 1.5;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * pad),
    longitudeDelta: Math.max(0.02, (maxLng - minLng) * pad),
  };
}

export function NearbyMap({ from, results, radiusKm, onSelect }: {
  from: Point;
  results: Nearby[];
  radiusKm: number;
  onSelect: (notice: Notice) => void;
}) {
  const colors = useColors();
  const mapRef = useRef<MapView>(null);
  const region = useMemo(
    () => regionFor(from, results, radiusKm),
    [from, results, radiusKm],
  );

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={region}
        // The system's own blue dot, drawn by Android from the device's fix.
        // Nothing about it passes through this app.
        showsUserLocation
        showsMyLocationButton
        toolbarEnabled={false}
        accessibilityLabel="Map of nearby Janazah notices"
      >
        {results.map(({ notice }) => {
          const place = notice.prayerLocation;
          if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) {
            return null;
          }
          const time = formatNoticeTime(notice);
          const who = displayName(notice);
          return (
            <Marker
              key={notice.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={who ? `${who}, ${notice.orgName}` : notice.orgName}
              description={
                isCancelled(notice)
                  ? 'Cancelled'
                  : `${time.day} ${time.time}${time.zone ? ` ${time.zone}` : ''}`
              }
              pinColor={isCancelled(notice) ? colors.danger : colors.accent}
              onCalloutPress={() => onSelect(notice)}
            />
          );
        })}
      </MapView>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: space.md,
          right: space.md,
          bottom: space.md,
          padding: space.sm,
          borderRadius: 8,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Text variant="caption" tone="subtle">
          Pins are the prayer locations on published notices. Tap one, then tap
          its label, to open the notice.
        </Text>
      </View>
    </View>
  );
}
