// The one place the app asks about notifications without being asked first.
//
// Following a masjid is the moment somebody has said, in the clearest way the
// app offers, that they want to hear from it. Doing nothing at that moment
// and waiting for them to find the bell in the Home header is how an app ends
// up with a following list and no alerts turned on.
//
// It is a prompt, not a permission request. Tapping it opens Alerts, which is
// where the explanation lives and where the system prompt is actually spent.
// Android 13 shows that prompt once and never again, and it is not going to
// be spent from a card on a list screen.
//
// Three conditions, all of them necessary, so this is never nagging:
//
//   at least one masjid is followed, so there is something to be told about
//   alerts are off on this device
//   the permission has not been permanently denied, because then the answer
//   is Settings and this card would be a dead end
//
// It reads state directly rather than through useAlerts, which does channel
// setup and a topic sync on mount. That work belongs on the Alerts screen,
// not on a list somebody is scrolling.

import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Surface } from '../../components/Surface';
import { isEnabled, permissionState } from '../../lib/notifications';
import { useColors, space } from '../../theme';

export function AlertsPrompt({ following }: { following: number }) {
  const colors = useColors();
  const [show, setShow] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    if (following === 0) { setShow(false); return () => {}; }

    (async () => {
      const [on, permission] = await Promise.all([isEnabled(), permissionState()]);
      if (!cancelled) setShow(!on && permission !== 'denied');
    })().catch(() => {});

    return () => { cancelled = true; };
  }, [following]));

  if (!show) return null;

  return (
    <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
      <Surface padded level="raised" style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.4 1.2 4.8 1.7 5.4a.6.6 0 0 1-.4 1H5.2a.6.6 0 0 1-.4-1c.5-.6 1.7-2 1.7-5.4z"
              stroke={colors.accent} strokeWidth={1.7}
              strokeLinecap="round" strokeLinejoin="round" fill="none"
            />
            <Path
              d="M10.2 19.2a2 2 0 0 0 3.6 0"
              stroke={colors.accent} strokeWidth={1.7} strokeLinecap="round" fill="none"
            />
          </Svg>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            Hear when they announce a Janazah
          </Text>
        </View>
        <Text variant="callout" tone="muted">
          {following === 1
            ? 'Alerts are off, so nothing from this masjid will reach your phone.'
            : 'Alerts are off, so nothing from these masjids will reach your phone.'}
        </Text>
        <Button
          label="Set up alerts"
          kind="primary"
          size="compact"
          onPress={() => router.push('/alerts')}
        />
      </Surface>
    </View>
  );
}
