// Loading placeholders.
//
// A skeleton rather than a spinner, because a spinner says "wait" while a
// skeleton says "this is a list of notices, and it is nearly here". On a weak
// connection outside a masjid that difference is the difference between
// waiting and wondering whether the app is broken.
//
// The sweep is a single shared value driving a translation, on the UI thread,
// and it stops entirely under reduce motion, where the placeholders simply sit
// still. It is slow on purpose: a fast shimmer reads as urgency.

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { useColors, radius, space } from '../theme';
import { exitScreen, useReduceMotion } from '../theme/motion';

const SWEEP_MS = 1400;

function Bone({ width, height = 12, round = radius.sm }: {
  width: number | `${number}%`;
  height?: number;
  round?: number;
}) {
  const colors = useColors();
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduce) return undefined;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [reduce]);

  const sweep = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.4,
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: round,
          backgroundColor: colors.bgSunk,
        },
        reduce ? null : sweep,
      ]}
    />
  );
}

/** One notice, as a placeholder. Mirrors the shape of a real row. */
export function NoticeSkeleton() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading notices"
      style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm }}
    >
      <Bone width="45%" height={20} />
      <Bone width="62%" height={15} />
      <Bone width="38%" height={13} />
    </View>
  );
}

/**
 * A screenful of them.
 *
 * It fades out as it is replaced rather than vanishing on the frame the data
 * arrives. The rows that take its place fade in with a stagger (RowIn), so
 * the handoff reads as one movement instead of a flash of empty background
 * between two layouts.
 */
export function NoticeSkeletonList({ count = 4 }: { count?: number }) {
  const colors = useColors();
  const reduce = useReduceMotion();
  return (
    <Animated.View exiting={exitScreen(reduce)}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index}>
          {index > 0 ? (
            <View
              style={{ height: 1, marginLeft: space.lg, backgroundColor: colors.line }}
            />
          ) : null}
          <NoticeSkeleton />
        </View>
      ))}
    </Animated.View>
  );
}

export { Bone };
