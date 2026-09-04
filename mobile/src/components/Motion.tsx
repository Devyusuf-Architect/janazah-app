// Entering animations, as components.
//
// Wrapping this rather than repeating `entering={...}` at every call site is
// not tidiness: it is what guarantees the reduce-motion check happens. A hook
// that has to be remembered is a hook that eventually is not, and the failure
// is invisible to whoever writes the code and obvious to the one person who
// asked their phone to stop animating.

import React from 'react';
import Animated from 'react-native-reanimated';
import type { ViewProps } from 'react-native';

import { enterRow, enterScreen, useReduceMotion } from '../theme/motion';

/** A screen's content, fading in once. */
export function FadeInView({ children, ...rest }: ViewProps) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterScreen(reduce)} {...rest}>
      {children}
    </Animated.View>
  );
}

/**
 * One row in a list, rising in with a stagger based on its position.
 *
 * `index` is the row's position, not a key. Passing a stable index means the
 * cascade runs top to bottom; passing something else makes it arrive in an
 * order nobody can predict.
 */
export function RowIn({ index = 0, children, ...rest }: ViewProps & { index?: number }) {
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterRow(index, reduce)} {...rest}>
      {children}
    </Animated.View>
  );
}

export { Animated };
