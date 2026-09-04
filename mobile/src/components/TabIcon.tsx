// Tab bar icons.
//
// Drawn as SVG paths rather than pulled from an icon font, for two reasons:
// nothing else in the app needs an icon set, and a font would be another
// thing to load before the first paint of an app people open in a hurry.
//
// The active state thickens the stroke rather than filling the shape. Filled
// and outlined versions of the same glyph read as two different icons at a
// glance; a heavier line reads as the same icon, selected.

import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export type TabIconName =
  | 'home' | 'notices' | 'near' | 'follow' | 'alert' | 'profile';

const SIZE = 24;

export function TabIcon({ name, color, focused }: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) {
  const strokeWidth = focused ? 2.2 : 1.7;
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24" accessibilityRole="image">
      {name === 'home' ? (
        <>
          <Path d="M3.5 10.5 12 4l8.5 6.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" {...common} />
          <Path d="M9.5 20v-5h5v5" {...common} />
        </>
      ) : null}

      {name === 'notices' ? (
        <>
          <Path d="M5 4.2h9.2L19 8.6V19a.8.8 0 0 1-.8.8H5a.8.8 0 0 1-.8-.8V5a.8.8 0 0 1 .8-.8z" {...common} />
          <Path d="M14 4.4v4.4h4.6" {...common} />
          <Path d="M7.4 12.4h8.2M7.4 16h5.4" {...common} />
        </>
      ) : null}

      {name === 'near' ? (
        <>
          <Path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21z" {...common} />
          <Circle cx="12" cy="10.6" r="2.4" {...common} />
        </>
      ) : null}

      {name === 'follow' ? (
        <Path
          d="M12 20.2 5.2 13.6a4.3 4.3 0 0 1 6.1-6.1l.7.7.7-.7a4.3 4.3 0 0 1 6.1 6.1z"
          {...common}
        />
      ) : null}

      {name === 'alert' ? (
        <>
          <Path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.4 1.2 4.8 1.7 5.4a.6.6 0 0 1-.4 1H5.2a.6.6 0 0 1-.4-1c.5-.6 1.7-2 1.7-5.4z" {...common} />
          <Path d="M10.2 19.2a2 2 0 0 0 3.6 0" {...common} />
        </>
      ) : null}

      {name === 'profile' ? (
        <>
          <Circle cx="12" cy="8.6" r="3.6" {...common} />
          <Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" {...common} />
        </>
      ) : null}
    </Svg>
  );
}
