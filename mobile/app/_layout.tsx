// The root layout.
//
// Everything the app needs before any screen renders: the emulator
// connection, the theme, the query client, and the providers for auth,
// follows and location.
//
// The index route is now the splash, which decides where to send somebody:
// the welcome panels, sign-in, or the app. The mobile app requires an
// account, so useAuthGate keeps anyone who signs out or whose session expires
// from staying inside it. The web site's anonymous browsing is untouched;
// nothing in the shared modules changed for this.

import React, { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';

import { connectEmulators } from '../src/lib/firebase';
import { AuthProvider } from '../src/lib/auth';
import { FollowsProvider } from '../src/features/following/useFollows';
import { LocationProvider } from '../src/features/nearby/useLocation';
import { useNotificationRouting } from '../src/features/alerts/useNotificationRouting';
import { useAuthGate } from '../src/features/launch/AuthGate';
import { DevBanner } from '../src/components/DevBanner';
import { initSampleMode } from '../src/lib/sample';
import { ThemeProvider, useTheme } from '../src/theme';
import { motion, useReduceMotion } from '../src/theme/motion';

// Connected at module scope so it happens before the first query, and only
// ever once. The function is itself idempotent for Fast Refresh.
connectEmulators();

/**
 * The route the root stack opens on.
 *
 * Both app/(launch)/index.tsx and app/(tabs)/index.tsx resolve to "/", which
 * expo-router permits as a shared route: "/(launch)" and "/(tabs)" pick
 * between them. What it does not do is guarantee which one a cold start lands
 * on, and getting that wrong means a signed-out person sees Home for a frame
 * before the gate moves them. Pinning it here removes the ambiguity: the
 * splash is always first, and it decides where to go from there.
 */
export const unstable_settings = { anchor: '(launch)' };

// Coming back to the app is what stands in for "the connection returned".
//
// The app deliberately does not watch the network state: that would mean
// ACCESS_NETWORK_STATE and a dependency for a question Firestore already
// answers on every read (see src/lib/connectivity.ts). What it can watch for
// free is the app itself becoming active, which is when somebody is looking,
// and which covers the case the brief cared about: walking out of a basement
// car park and reopening Ta'ziyah.
//
// TanStack Query has refetchOnWindowFocus on, and this is what gives it a
// window to focus on a phone.
AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
});

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
  const reduce = useReduceMotion();

  // Tapping a notification has to open the right notice whether the app was
  // in the foreground, in the background, or not running at all.
  useNotificationRouting();
  // The account requirement. See src/features/launch/AuthGate.tsx.
  useAuthGate();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // Reduce motion turns screen transitions off rather than shortening
          // them. Somebody who asked for no animation asked for no animation.
          animation: reduce ? 'none' : 'slide_from_right',
          animationDuration: motion.slow,
          // The screen behind travels a little as the new one covers it,
          // rather than sitting still under a sliding sheet. It is what makes
          // a push read as one movement instead of two surfaces.
          animationTypeForReplace: 'push',
          gestureEnabled: !reduce,
          // A screen that is not visible stops re-rendering. Firestore
          // listeners and timers are already scoped to focus; this covers the
          // rest.
          freezeOnBlur: true,
        }}
      >
        {/* The splash, the welcome panels and sign-in. Not behind the gate,
            because this is where somebody goes to get past it. */}
        <Stack.Screen
          name="(launch)"
          options={{ animation: 'fade', animationDuration: motion.slow }}
        />

        {/* Entering and leaving the app itself fades rather than slides.
            There is no "back" from the splash to sign-in, so a horizontal
            movement would imply a stack that does not exist. */}
        <Stack.Screen
          name="(tabs)"
          options={{ animation: 'fade', animationDuration: motion.slow }}
        />
        <Stack.Screen
          name="n/[id]"
          options={{ animation: reduce ? 'none' : 'slide_from_bottom' }}
        />
        <Stack.Screen name="o/[id]" />
        <Stack.Screen name="masjids" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="about" />
        <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="delete-account" options={{ presentation: 'modal' }} />
      </Stack>

      {/* Development only, and it says which backend is connected. See
          src/components/DevBanner.tsx: a dev build talks to the local
          emulators by default, and with none running that is
          indistinguishable from a broken app. */}
      <DevBanner />
    </>
  );
}

export default function RootLayout() {
  const [, setSamplesResolved] = useState(false);

  useEffect(() => {
    // Whether the administrator has sample data switched on. Read once, at
    // launch, and defaulting to off: a network failure at startup must never
    // be the reason a fictional Janazah notice appears.
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
