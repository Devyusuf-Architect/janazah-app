// react-native-svg, for the harness only.
//
// The real package's web build still reaches into React Native's native
// codegen internals, which esbuild cannot resolve. The harness only needs
// three primitives and a browser already draws SVG, so these render real DOM
// elements. On a device the actual library is used; nothing here ships.

import React from 'react';

const attrs = ({ strokeWidth, strokeLinecap, strokeLinejoin, ...rest }) => ({
  ...rest,
  strokeWidth,
  strokeLinecap,
  strokeLinejoin,
});

const Svg = ({ width, height, viewBox, children, ...rest }) =>
  React.createElement('svg', { width, height, viewBox, ...attrs(rest) }, children);

const Path = (props) => React.createElement('path', attrs(props));
const Circle = (props) => React.createElement('circle', attrs(props));
const Rect = (props) => React.createElement('rect', attrs(props));
const G = ({ children, ...rest }) => React.createElement('g', attrs(rest), children);

export default Svg;
export { Svg, Path, Circle, Rect, G };
