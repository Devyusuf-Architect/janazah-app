// Motion, and switching it off.
//
// Android exposes "Remove animations" through AccessibilityInfo's
// reduce-motion flag. When it is on, every duration in the app becomes zero
// rather than merely shorter: a person who has asked for no animation has
// asked for no animation.

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

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

export { motion };
