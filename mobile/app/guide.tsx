// How to pray Salat al-Janazah.
//
// The route. The content is src/features/guide/GuideBody.tsx, which is where
// the layout lives and which the design harness can render on its own.
//
// One thing this screen does that the web page does not have to: Arabic is
// set at 28pt with 52pt of leading and is never truncated, scaled to fit, or
// put behind a "show more". Somebody reads it standing up, in poor light,
// moments before praying.

import React from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../src/components/Screen';
import { Button } from '../src/components/Button';
import { GuideBody } from '../src/features/guide/GuideBody';
import { space } from '../src/theme';

export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Salat al-Janazah' }} />
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.md }}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Button
            label="Back"
            size="compact"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </View>
        <GuideBody />
      </ScreenScroll>
    </Screen>
  );
}
