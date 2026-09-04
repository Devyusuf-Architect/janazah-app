// Motion, and switching it off.
//
// Built on Reanimated, which was already a dependency and which runs
// animations on the UI thread rather than through the JavaScript bridge. That
// is the whole reason to use it here: a list that animates its rows in while
// the user is scrolling must not drop frames, and a bridge-driven animation
// on a mid-range Android phone will.
//
// Reduce motion is respected everywhere by construction rather than by
// remembering. `useDuration` returns zero when the system asks for no
// animation, and every entering animation in this file is built from it, so
// there is no path that animates against the user's wishes. Android exposes
// this as "Remove animations" in accessibility settings.
//
// Nothing here loops, pulses, or draws attention to itself. An app about
// funerals should feel like it is getting out of the way.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  withSpring,
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

import { motion } from './tokens';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (!cancelled) setReduce(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged', setReduce,
    );
    return () => { cancelled = true; subscription.remove(); };
  }, []);

  return reduce;
}

/** A duration that respects the accessibility setting. */
export function useDuration(): (ms: number) => number {
  const reduce = useReduceMotion();
  return (ms: number) => (reduce ? 0 : ms);
}

export const easeOut = Easing.bezier(...motion.easing);

export const timing = (duration: number = motion.base): WithTimingConfig =>
  ({ duration, easing: easeOut });

export const spring: WithSpringConfig = motion.spring;
export const pressSpring: WithSpringConfig = motion.press;

/**
 * The entering animation for a row in a list.
 *
 * A short rise and fade, staggered by position, so a screenful of notices
 * settles rather than snapping into place. The stagger is capped: past about
 * the eighth row nobody is watching, and a long cascade would delay content
 * somebody is scrolling towards.
 */
export function enterRow(index: number, reduce: boolean) {
  if (reduce) return undefined;
  const delay = Math.min(index, 7) * motion.stagger;
  return FadeInDown.duration(motion.base).delay(delay).easing(easeOut);
}

/** The entering animation for a whole screen's content. */
export function enterScreen(reduce: boolean) {
  if (reduce) return undefined;
  return FadeIn.duration(motion.base).easing(easeOut);
}

export function exitScreen(reduce: boolean) {
  if (reduce) return undefined;
  return FadeOut.duration(motion.fast).easing(easeOut);
}

export { withSpring, withTiming, FadeIn, FadeInDown, FadeOut, motion };
