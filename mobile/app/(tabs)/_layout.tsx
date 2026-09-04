// Bottom navigation.
//
// Five tabs: Home, Janazahs, Nearby, Following, Profile. They are the five
// things a community member does, and a sixth would start pushing labels into
// ellipses at large font sizes.
//
// Alerts used to be the fourth tab and is not any more. It is a settings
// screen, opened perhaps twice in a year, and it was taking a fifth of the
// most valuable row of pixels in the app. It now lives behind the bell in the
// Home header and as a row in Profile, which is where people look for
// settings anyway.
//
// Coordinator and administrator functions are still deliberately absent from
// the bar. Somebody who runs a masjid reaches their organization from Home,
// where a card appears for them and nobody else; publishing a notice remains
// a desk job that the web console does better.

import React from 'react';
import { Tabs } from 'expo-router';

import { TabBar } from '../../src/components/TabBar';
import { motion, useReduceMotion } from '../../src/theme/motion';

const TABS: { name: string; title: string }[] = [
  { name: 'index', title: 'Home' },
  { name: 'janazahs', title: 'Janazahs' },
  { name: 'nearby', title: 'Nearby' },
  { name: 'following', title: 'Following' },
  { name: 'profile', title: 'Profile' },
];

export default function TabsLayout() {
  const reduce = useReduceMotion();

  return (
    <Tabs
      // The bar is drawn by src/components/TabBar.tsx. See the note there for
      // why the default one was not enough.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // A cross-fade rather than a slide. Tabs are siblings, not a
        // hierarchy, and sliding between them implies a direction that does
        // not exist. Short, because this happens more often than any other
        // transition in the app.
        animation: reduce ? 'none' : 'fade',
        // An inactive tab stops re-rendering. Five tabs stay mounted once
        // visited, and four of them re-rendering behind a cross-fade is
        // exactly the kind of thing that costs frames on a mid-range phone.
        freezeOnBlur: true,
        transitionSpec: {
          animation: 'timing',
          config: { duration: motion.fast },
        },
      }}
    >
      {TABS.map(({ name, title }) => (
        <Tabs.Screen key={name} name={name} options={{ title }} />
      ))}
    </Tabs>
  );
}
