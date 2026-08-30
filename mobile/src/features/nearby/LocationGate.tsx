// Asking for location, and explaining why first.
//
// Three states, and the difference between the second and third is the whole
// point of this component:
//
//   undetermined  Never asked, or asked and dismissed. Explain, then offer.
//   blocked       Denied permanently. The system will not prompt again, so
//                 offering a button that silently does nothing is worse than
//                 useless. Say where the setting is instead.
//   unavailable   No location services on this device at all.
//
// The explanation comes before the system dialog rather than after it. An
// Android permission prompt on its own says "Allow Ta'ziyah to access this
// device's location?", which is exactly the question somebody should want a
// reason for, and this is where the reason goes.
//
// It is also one screen's worth of text and no more. The brief was explicit
// that a disabled state must not consume half the screen, and this is the
// state most people see on their first visit to this tab.

import React from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Surface } from '../../components/Surface';
import { space } from '../../theme';
import { SETTINGS_HINT, type PermissionState } from '../../lib/nearby';

export function LocationGate({ state, busy, error, onEnable }: {
  state: PermissionState;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
}) {
  if (state === 'unavailable') {
    return (
      <Surface padded style={{ margin: space.lg, gap: space.sm }}>
        <Text variant="bodyStrong">This device cannot provide a location</Text>
        <Text variant="callout" tone="muted">
          You can still search for a masjid or a city, and follow masjids to
          hear about their notices.
        </Text>
      </Surface>
    );
  }

  if (state === 'denied') {
    return (
      <Surface padded style={{ margin: space.lg, gap: space.sm }}>
        <Text variant="bodyStrong">Location is turned off for Ta’ziyah</Text>
        {/* Android will not prompt again once somebody has denied it twice,
            so a button here would do nothing at all. The path through
            Settings is the only thing that helps. */}
        <Text variant="callout" tone="muted">{SETTINGS_HINT}</Text>
      </Surface>
    );
  }

  return (
    <Surface padded style={{ margin: space.lg, gap: space.md }}>
      <Text variant="bodyStrong">See which Janazahs are near you</Text>
      <Text variant="callout" tone="muted">
        Ta’ziyah compares your location with the masjids that have published a
        notice, and shows the closest first.
      </Text>
      <Text variant="callout" tone="muted">
        This happens on your phone. Your location is not sent to us, to any
        masjid, or to anyone else, and no record is kept of where you have
        been. Only your most recent position is stored, on this device, and
        turning this off erases it.
      </Text>
      {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
      <Button
        label="Use my location"
        kind="primary"
        busy={busy}
        onPress={onEnable}
      />
    </Surface>
  );
}
