// react-native-safe-area-context, for the harness only.
//
// The real package's web build imports React Native's native codegen
// internals, which esbuild cannot resolve. A browser page has no notch, so
// the harness reports zero insets and renders children straight through. The
// app uses the real library.

import React from 'react';

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 };

export const useSafeAreaInsets = () => ZERO;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 411, height: 900 });
export const SafeAreaProvider = ({ children }) => children;
export const SafeAreaView = ({ children, ...rest }) =>
  React.createElement('div', rest, children);
export const initialWindowMetrics = { insets: ZERO, frame: { x: 0, y: 0, width: 411, height: 900 } };
