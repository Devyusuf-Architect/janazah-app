// Expo configuration for Ta'ziyah Mobile.
//
// The Android package name is fixed for the life of the app: Play keys a
// listing to it and it can never be changed afterwards. It must also match
// the Android app registered in the existing Firebase project
// (janaza-app-5baf2), because google-services.json is keyed to it.

import type { ExpoConfig } from 'expo/config';

const ANDROID_PACKAGE = 'com.taziyah.app';

// The public site. Notifications link to it, and Android App Links let those
// links open this app instead of a browser. Kept here rather than in the
// design tokens because it is deployment configuration, not styling.
const SITE = 'taziyah.com';

const config: ExpoConfig = {
  name: "Ta'ziyah",
  slug: 'taziyah',
  scheme: 'taziyah',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  // The dark green identity, so the system chrome behind the app matches it
  // rather than flashing white on a cold start.
  backgroundColor: '#faf7f2',
  assetBundlePatterns: ['**/*'],

  android: {
    package: ANDROID_PACKAGE,
    // Google Play requires new apps and updates to target Android 16
    // (API 36) from 31 August 2026. Pinned in expo-build-properties below
    // rather than left to whatever the template defaults to.
    adaptiveIcon: {
      foregroundImage: './assets/icon-foreground.png',
      monochromeImage: './assets/icon-monochrome.png',
      backgroundColor: '#14503f',
    },
    // Requested at runtime, contextually, never on first launch. Declaring
    // them here only makes the request possible.
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'POST_NOTIFICATIONS',
    ],
    // Permissions that arrive from a dependency's own manifest and that this
    // app has no use for. Each one has to be declared and defended in the
    // Play Data Safety form, so carrying one the app never exercises costs
    // review time and tells users something untrue about what it does.
    //
    //   ACCESS_BACKGROUND_LOCATION  Nearby matching needs only a foreground
    //     fix. Asking for this triggers a much heavier Play review and a
    //     disclosure this app could not justify.
    //   READ/WRITE_EXTERNAL_STORAGE  Pulled in by expo-file-system, which
    //     expo depends on. Legacy, capped at API 32, and unused here: the app
    //     writes nothing to shared storage.
    //
    // Not blocked, and to be checked when the first release build is made
    // (Phase 7): SYSTEM_ALERT_WINDOW and VIBRATE. VIBRATE is what lets a
    // notification vibrate and is wanted. SYSTEM_ALERT_WINDOW comes from the
    // React Native development menu; whether it survives into a release
    // variant has to be read off a real release manifest rather than guessed,
    // and blocking it blind risks breaking the dev client's menu.
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    googleServicesFile: './google-services.json',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: SITE, pathPrefix: '/n/' },
          { scheme: 'https', host: SITE, pathPrefix: '/o/' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },

  plugins: [
    'expo-router',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
        },
      },
    ],
    [
      'expo-location',
      {
        // Shown in the system permission dialog on iOS. Android's rationale
        // is our own screen, which says the same thing at more length.
        locationWhenInUsePermission:
          'Ta’ziyah uses your location only on this device, to show which Janazahs are near you. It is never sent to us or to any masjid.',
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#14503f',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#faf7f2',
        dark: { backgroundColor: '#121614' },
      },
    ],
    'expo-secure-store',
    'expo-web-browser',
  ],

  experiments: { typedRoutes: true },

  extra: {
    siteOrigin: `https://${SITE}`,
    androidPackage: ANDROID_PACKAGE,
  },
};

export default config;
