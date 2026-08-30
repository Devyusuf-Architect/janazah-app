// An unrecognised link.
//
// Reached when a link points at something this version of the app does not
// have a screen for, which will happen: a link shared from a newer build, or a
// path the web site added first. It offers the way back rather than a dead end.

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { space } from '@/theme';

export default function NotFound() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md }}>
        <Text variant="title" serif>That link did not open</Text>
        <Text variant="callout" tone="muted">
          It may point at something this version of the app does not show yet.
          You can find it at taziyah.com.
        </Text>
        <Button label="Go to Home" kind="primary" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
