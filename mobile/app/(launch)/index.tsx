// The splash.
//
// Not a loading screen. It is on screen for as long as the app genuinely
// needs to decide where to send somebody, which is usually well under a
// second: read whether onboarding has been seen, and wait for Firebase to
// report an auth state. A splash held open for a fixed number of seconds to
// look impressive is a fixed number of seconds stolen from a person who
// opened this app because a funeral is today.
//
// It does hold a floor of about 650ms, and that is the one deliberate delay:
// below that the mark appears and vanishes as a flicker, which reads as a
// glitch rather than as a brand.
//
// Where it sends you:
//   never onboarded    -> the welcome panels
//   onboarded, no user -> sign in
//   signed in          -> the app

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

import { BrandGround } from '../../src/features/launch/BrandGround';
import { Brandmark } from '../../src/features/launch/Brandmark';
import { Text } from '../../src/components/Text';
import { hasOnboarded } from '../../src/features/launch/onboarding-state';
import { useAuth } from '../../src/lib/auth';
import { motion, timing, useReduceMotion } from '../../src/theme/motion';
import { space, palettes } from '../../src/theme';

/** Below this the mark reads as a flicker rather than as a brand. */
const MINIMUM_MS = 650;

export default function SplashScreen() {
  const { user, ready, isAnonymous } = useAuth();
  const reduce = useReduceMotion();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [floorPassed, setFloorPassed] = useState(false);
  const navigated = useRef(false);

  const wordmark = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (!reduce) {
      wordmark.value = withDelay(220, withTiming(1, timing(motion.slow)));
    }
    const timer = setTimeout(() => setFloorPassed(true), MINIMUM_MS);
    hasOnboarded().then(setOnboarded);
    return () => clearTimeout(timer);
  }, [reduce]);

  useEffect(() => {
    if (navigated.current) return;
    if (!ready || onboarded === null || !floorPassed) return;
    navigated.current = true;

    // An anonymous session is not an account. It exists so reports and topic
    // subscriptions have something to attribute against, and it must not let
    // somebody past the door.
    const signedIn = !!user && !isAnonymous;

    if (!onboarded) router.replace('/(launch)/welcome');
    else if (!signedIn) router.replace('/(launch)/signin');
    else router.replace('/(tabs)');
  }, [ready, onboarded, floorPassed, user, isAnonymous]);

  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmark.value }));

  return (
    <BrandGround>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl }}>
        <Brandmark size={104} tone="light" />
        <Animated.View style={wordmarkStyle}>
          <Text
            variant="display"
            serif
            // The launch ground is deep green in both schemes, so the
            // wordmark takes the light palette's onBrand rather than the
            // current scheme's ink.
            style={{ color: palettes.light.onBrand, textAlign: 'center' }}
          >
            Ta’ziyah
          </Text>
        </Animated.View>
      </View>
    </BrandGround>
  );
}
