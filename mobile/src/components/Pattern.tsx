// The brand motif.
//
// An eight-point star tessellation, the khatam, drawn as a repeating grid of
// strokes. It is the oldest and plainest form of Islamic geometric pattern,
// and it is used here at very low opacity as a ground on the launch screens
// and nowhere else.
//
// Two decisions worth stating, because the failure mode of this kind of
// ornament is tastelessness rather than a bug:
//
//   It appears on the splash, onboarding and sign-in grounds only. Not behind
//   a notice, not behind the guide, not behind a list. A pattern under
//   content about a funeral is decoration competing with the thing somebody
//   opened the app for.
//
//   It is drawn at 6% opacity or less. It should read as texture in the deep
//   green, noticed on the second look rather than the first. Anything
//   stronger turns a quiet screen into a busy one.

import React from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

type Props = {
  /** Edge length of one repeat, in points. */
  size?: number;
  color: string;
  opacity?: number;
};

/**
 * One tile: an eight-point star formed by two overlaid squares, plus the
 * lines that link it to its neighbours so the repeat reads as continuous
 * rather than as a field of separate stars.
 */
function tile(size: number): string {
  const c = size / 2;
  const r = size * 0.42;
  const inner = r * 0.41;

  const points: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const outerAngle = (Math.PI / 4) * i - Math.PI / 8;
    const innerAngle = outerAngle + Math.PI / 8;
    points.push(
      `${c + r * Math.cos(outerAngle)},${c + r * Math.sin(outerAngle)}`,
      `${c + inner * Math.cos(innerAngle)},${c + inner * Math.sin(innerAngle)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

export function Pattern({ size = 58, color, opacity = 0.04 }: Props) {
  const path = tile(size);
  // Enough repeats to overflow any phone. Drawn at absolute size rather than
  // scaled to fit: a viewBox stretched over the screen turns one tile into a
  // single enormous star, which is decoration rather than texture.
  //
  // Each tile is placed with a translate transform on its own group. Neither
  // <Path> nor <G> takes x and y as position attributes in SVG, so setting
  // them silently stacks every tile at the origin, which is exactly what a
  // single star in the corner looks like.
  const columns = 10;
  const rows = 18;

  const tiles: React.ReactElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    // Every other row is offset by half a tile so the stars interlock rather
    // than sitting in a grid of obvious squares.
    const offset = row % 2 ? size / 2 : 0;
    for (let column = 0; column < columns; column += 1) {
      tiles.push(
        <G
          key={`${row}.${column}`}
          transform={`translate(${column * size - offset}, ${row * size})`}
        >
          <Path d={path} stroke={color} strokeWidth={1.1} fill="none" />
        </G>,
      );
    }
  }

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity,
        overflow: 'hidden',
      }}
    >
      <Svg width={size * columns} height={size * rows}>{tiles}</Svg>
    </View>
  );
}
