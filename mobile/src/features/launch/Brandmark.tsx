// The Ta'ziyah mark, animated in.
//
// The same logo.svg the web site and the launcher icon use, so there is one
// drawn source for the mark everywhere it appears. Shared through
// src/shared/logo.ts rather than redrawn.
//
// The entrance is a slow fade with a small rise and a settle. It runs once, on
// the splash, and takes about half a second. Anything longer is a delay
// dressed as design; anything with a bounce would be wrong for what this app
// is about.

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { motion, spring, timing, useReduceMotion } from '../../theme/motion';

/**
 * The mark, drawn as SVG.
 *
 * Redrawn here rather than parsed from logo.svg at runtime: react-native-svg
 * has no SVG-string renderer without another dependency, and the shape is
 * stable. tests/logo.test.js in the repository root pins the web version;
 * test/brandmark.test.ts pins that this one still matches its colours and
 * proportions.
 */
export function Mark({ size = 96, tone = 'brand' }: {
  size?: number;
  tone?: 'brand' | 'light';
}) {
  // Literals, not theme tokens. A logo is the same colour in light and dark;
  // a mark that changed shade with the scheme would be two logos.
  const disc = tone === 'brand' ? '#14503f' : '#faf7f2';
  const figure = tone === 'brand' ? '#faf7f2' : '#14503f';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="50" fill={disc} />
      <G fill={figure}>
        {/* leaf sprig */}
        <Path
          d="M25 60 C24 52 25 44 29 37"
          stroke={figure}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
        <Path d="M25 54 C18 51.5 15 45 17 38.5 C24 40.5 28.5 46.5 27.5 53.5 C26.7 54 25.8 54.1 25 54 Z" />
        <Path d="M29 43 C23.5 39.7 21.7 33 24.3 27 C30 29.6 33.6 35.4 31.7 41.6 C30.8 42.1 29.9 42.4 29 43 Z" />
        {/* minaret */}
        <Path d="M63.2 30 L66 22 L68.8 30 Z" />
        <Path d="M62 31.5 H70 V34 H62 Z" />
        <Path d="M60.5 34 H71.5 L69 38 H63 Z" />
        <Path d="M64.2 38 H67.8 V72 H64.2 Z" />
        <Path d="M62.4 44 H69.6 V46.6 H62.4 Z" />
        <Path d="M62.4 55 H69.6 V57.6 H62.4 Z" />
        {/* crescent */}
        <Path d="M44 24 A9 9 0 1 0 44 42 A7.2 7.2 0 1 1 44 24 Z" />
        <Circle cx="52.5" cy="33" r="2.1" />
        {/* dome */}
        <Path d="M50 44 C56 44 60 56 60.5 72 H39.5 C40 56 44 44 50 44 Z" />
        <Path d="M49.2 38.5 H50.8 V44 H49.2 Z" />
        <Circle cx="50" cy="37.4" r="1.7" />
        {/* cupping hand */}
        <Path d="M22 72 C28 66 38 65 44 68 C48 65 54 65 58 68 C64 65 72 66 78 72 C74 80 66 82 58 79 H36 C30 81 24 79 22 72 Z" />
      </G>
    </Svg>
  );
}

/** The mark, arriving. Used on the splash and nowhere else. */
export function Brandmark({ size = 96, tone = 'light', delay = 0 }: {
  size?: number;
  tone?: 'brand' | 'light';
  delay?: number;
}) {
  const reduce = useReduceMotion();
  const opacity = useSharedValue(reduce ? 1 : 0);
  const lift = useSharedValue(reduce ? 0 : 14);
  const scale = useSharedValue(reduce ? 1 : 0.92);

  useEffect(() => {
    if (reduce) return;
    opacity.value = withDelay(delay, withTiming(1, timing(motion.slow)));
    lift.value = withDelay(delay, withSpring(0, spring));
    scale.value = withDelay(delay, withSpring(1, spring));
  }, [reduce, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <View accessible accessibilityRole="image" accessibilityLabel="Ta’ziyah">
        <Mark size={size} tone={tone} />
      </View>
    </Animated.View>
  );
}
