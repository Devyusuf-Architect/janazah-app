// Bottom navigation.
//
// Five tabs, chosen because they are the five things a community member
// actually does, and because a sixth would start pushing labels into
// ellipses at large font sizes. Everything else lives under Profile, which is
// what the brief asked for and what keeps this bar readable.
//
// Coordinator and administrator functions are deliberately absent. They are
// not hidden for security (firestore.rules decides that, not this file); they
// are absent because publishing a notice is a desk job and the web console
// does it better.

import React from 'react';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { useColors, type } from '@/theme';
import { TabIcon, type TabIconName } from '@/components/TabIcon';

const TABS: { name: string; title: string; icon: TabIconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'nearby', title: 'Nearby', icon: 'near' },
  { name: 'following', title: 'Following', icon: 'follow' },
  { name: 'alerts', title: 'Alerts', icon: 'alert' },
  { name: 'profile', title: 'Profile', icon: 'profile' },
];

export default function TabsLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: {
          backgroundColor: colors.chrome,
          borderTopColor: colors.chromeLine,
          // A hairline, not the default heavier rule, which reads as a seam.
          borderTopWidth: 1,
          height: Platform.OS === 'android' ? 62 : undefined,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: type.caption.fontSize,
          fontWeight: '500',
          marginBottom: 6,
        },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name={icon} color={String(color)} focused={focused} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
