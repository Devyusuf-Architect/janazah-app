// The root layout.
//
// Everything the app needs before any screen renders: the emulator
// connection, the theme, the query client and the auth session. Auth resolves
// asynchronously, and nothing here waits for it, because reading notices
// needs no account and must not be held up by one.

import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { connectEmulators } from '../src/lib/firebase';
import { AuthProvider } from '../src/lib/auth';
import { FollowsProvider } from '../src/features/following/useFollows';
import { LocationProvider } from '../src/features/nearby/useLocation';
import { useNotificationRouting } from '../src/features/alerts/useNotificationRouting';
import { initSampleMode } from '../src/lib/sample';
import { ThemeProvider, useTheme } from '../src/theme';

// Connected at module scope so it happens before the first query, and only
// ever once. The function is itself idempotent for Fast Refresh.
connectEmulators();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A Janazah notice can be corrected minutes before the prayer, so
      // "fresh" is short. It is not zero, because re-fetching on every screen
      // focus over a weak connection is worse than a one-minute-old time.
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

function Chrome() {
  const { scheme, colors } = useTheme();
  // Tapping a notification has to open the right notice whether the app was
  // in the foreground, in the background, or not running at all. Wired here,
  // once, inside the router.
  useNotificationRouting();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="n/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="masjids" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="about" />
        <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="o/[id]" />
        <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="signin" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [, setSamplesResolved] = useState(false);

  useEffect(() => {
    // Whether the administrator has sample data switched on. Read once, at
    // launch, and defaulting to off: a network failure at startup must never
    // be the reason a fictional Janazah notice appears. The state flip is
    // what repaints the banner and the feed if the answer is yes.
    initSampleMode().then(() => setSamplesResolved(true)).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {/* Inside AuthProvider: the follow list merges with the
                  account's copy on sign-in, so it has to see auth state. */}
              <FollowsProvider>
                {/* One copy of the position and the alert preferences, shared
                    by every screen. Separate copies would let Alerts show one
                    radius while the device was subscribed to another. */}
                <LocationProvider>
                  <Chrome />
                </LocationProvider>
              </FollowsProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
