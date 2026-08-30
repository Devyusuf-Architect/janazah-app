// Alerts
//
// What you have been told about, and what you want to be told about.
//
// Built in Phase 5. This screen exists now so the navigation, the safe areas
// and the theme can be exercised on a device before there is anything to
// fetch.

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../src/components/Screen';
import { Text } from '../../src/components/Text';
import { space } from '../../src/theme';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, gap: space.sm }}>
        <Text variant="title" serif>Alerts</Text>
        <Text variant="callout" tone="muted">What you have been told about, and what you want to be told about.</Text>
      </View>
    </Screen>
  );
}
