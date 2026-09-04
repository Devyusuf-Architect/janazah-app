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
// What changed: the reason used to be two paragraphs, which is a page of
// legal text standing between somebody and a feature they have not decided
// they want yet. It is now two lines and a link. The full explanation did not
// go anywhere: it is behind "How location works", in the same words, and it
// is also where the privacy claim is made in full. Shortening the promise
// would be the one unacceptable version of this change; moving it one tap
// away, with the headline still on the screen, is not.

import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { Surface } from '../../components/Surface';
import { space } from '../../theme';
import { SETTINGS_HINT, type PermissionState } from '../../lib/nearby';

export function LocationGate({ state, busy, error, onEnable }: {
  state: PermissionState;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
}) {
  const [explaining, setExplaining] = useState(false);

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
    <>
      <Surface padded level="raised" style={{ margin: space.lg, gap: space.md }}>
        <Text variant="title">Find Janazahs near you</Text>
        <Text variant="callout" tone="muted">
          Your location stays on your device and is never sent to Ta’ziyah or
          to a masjid.
        </Text>
        {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
        <Button
          label="Use my location"
          kind="primary"
          full
          busy={busy}
          onPress={onEnable}
        />
        <Button
          label="How location works"
          kind="plain"
          onPress={() => setExplaining(true)}
        />
      </Surface>

      <Sheet
        visible={explaining}
        onClose={() => setExplaining(false)}
        title="How location works"
      >
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
          <Text variant="body">
            Ta’ziyah compares your location with the masjids that have
            published a notice, and shows the closest first.
          </Text>
          <Text variant="body">
            That comparison happens on your phone. Your location is not sent to
            us, to any masjid, or to anyone else, and no record is kept of
            where you have been.
          </Text>
          <Text variant="body">
            Only your most recent position is stored, on this device, and
            turning location off erases it.
          </Text>
          <Text variant="callout" tone="muted">
            Alerts about Janazahs near you work the same way. Your phone
            subscribes to broad map areas rather than telling us where it is.
          </Text>
        </View>
      </Sheet>
    </>
  );
}
