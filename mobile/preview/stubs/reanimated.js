// Reanimated, for the design harness only.
//
// The harness is a still photograph of the interface, not a running app: it
// exists to judge colour, type, spacing and hierarchy, which are exactly the
// things a screenshot can show and motion cannot. So the animated components
// render as plain views in their settled state, the hooks return inert
// values, and every entering animation is undefined, which is the same thing
// the real app does under reduce motion.
//
// Motion itself has to be judged on a device. Nothing here pretends otherwise.

import React from 'react';
import { View, Text, ScrollView, Image, Pressable } from 'react-native';

const passthrough = (Component) => React.forwardRef((props, ref) => {
  // Drop the animation props rather than passing them to the DOM, where React
  // would warn about every one of them on every render.
  const { entering, exiting, layout, sharedTransitionTag, ...rest } = props;
  return React.createElement(Component, { ...rest, ref });
});

const AnimatedView = passthrough(View);

const Animated = {
  View: AnimatedView,
  Text: passthrough(Text),
  ScrollView: passthrough(ScrollView),
  Image: passthrough(Image),
  createAnimatedComponent: passthrough,
};

export default Animated;
export const View_ = AnimatedView;

// Backed by React state, so that an effect assigning `.value = withTiming(1)`
// re-renders and the component settles into the state it would end in. Without
// this, anything that fades in from opacity 0 stays invisible in the harness,
// which looks exactly like a missing component.
export const useSharedValue = (initial) => {
  const [value, setValue] = React.useState(initial);
  const ref = React.useRef(null);
  if (!ref.current) {
    ref.current = {
      get value() { return valueRef.current; },
      set value(next) { valueRef.current = next; setValue(next); },
    };
  }
  const valueRef = React.useRef(initial);
  valueRef.current = value;
  return ref.current;
};

export const useAnimatedStyle = (factory) => {
  try {
    return factory() || {};
  } catch {
    return {};
  }
};
export const withTiming = (to) => to;
export const withSpring = (to) => to;
export const withDelay = (_, value) => value;
export const withRepeat = (value) => value;
export const cancelAnimation = () => {};
export const runOnJS = (fn) => fn;

const entering = {
  duration: () => entering,
  delay: () => entering,
  easing: () => entering,
  springify: () => entering,
};
export const FadeIn = entering;
export const FadeInDown = entering;
export const FadeInUp = entering;
export const FadeOut = entering;
export const Layout = entering;

export const Easing = {
  bezier: () => undefined,
  inOut: (fn) => fn,
  quad: undefined,
  linear: undefined,
};
