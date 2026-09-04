// How to pray Salat al-Janazah.
//
// The route. The content is src/features/guide/GuideBody.tsx, which is where
// the layout lives and which the design harness can render on its own.
//
// One thing this screen does that the web page does not have to: Arabic is
// set at 28pt with 52pt of leading and is never truncated, scaled to fit, or
// put behind a "show more". Somebody reads it standing up, in poor light,
// moments before praying. Where material is behind a tap, it is a whole
// section of prose that is, never a line of Arabic inside a recitation.

import React from 'react';
import { Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { GuideBody } from '../../src/features/guide/GuideBody';

export default function GuideScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Salat al-Janazah' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Salat al-Janazah" />
        <GuideBody />
      </ScreenScroll>
    </Screen>
  );
}
