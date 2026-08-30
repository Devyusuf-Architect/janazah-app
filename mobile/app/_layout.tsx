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
              <Chrome />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
