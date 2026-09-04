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
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../src/components/Screen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { GuideBody } from '../src/features/guide/GuideBody';

export default function GuideScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Salat al-Janazah' }} />
      <ScreenHeader />
      {/* The guide carries its own title, at the top of GuideBody, so this
          screen deliberately does not add a second one. */}
      <ScreenScroll>
        <GuideBody />
      </ScreenScroll>
    </Screen>
  );
}
