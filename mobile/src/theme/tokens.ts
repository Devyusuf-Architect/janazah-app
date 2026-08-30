// The design system.
//
// This is not public/css/styles.css ported. The web palette is the brand and
// it is kept: the same dark green, the same parchment, the same gold accent,
// the same ink scale. Everything else is rebuilt for a phone, because the two
// products are not the same product.
//
// Three rules the web stylesheet does not need and this file does:
//
//   1. Elevation is a border and a tint, not a shadow. Stacked shadows read
//      as clutter at arm's length, and Android renders them inconsistently.
//   2. Radii are small. A phone screen is mostly one column of rows; heavy
//      rounding on every one of them is the "endless cards" look.
//   3. Type is set once, here, with line heights that hold at 130% font
//      scale. A funeral notice is often read by someone with the system font
//      size turned up.

export type Scheme = 'light' | 'dark';

/**
 * The colour roles. Named by what they are for, never by what they look like,
 * so that "surface" is still correct in the dark scheme where it is nearly
 * black.
 */
export type Palette = {
  bg: string;
  bgSunk: string;
  surface: string;
  surfaceAlt: string;
  pressed: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSoft: string;
  accentLine: string;
  gold: string;
  goldSoft: string;
  goldLine: string;
  danger: string;
  dangerSoft: string;
  dangerLine: string;
  chrome: string;
  chromeLine: string;
  scrim: string;
};

const light: Palette = {
  bg: '#faf7f2',
  bgSunk: '#f2eee6',
  surface: '#ffffff',
  surfaceAlt: '#f8f5ef',
  // Pressed state for a row. Deliberately a tint of the surface rather than
  // grey, so it reads as the same material.
  pressed: '#efeae1',

  ink: '#16201c',
  ink2: '#40504a',
  ink3: '#6c7d76',

  line: '#e4ded3',
  lineStrong: '#d3ccbe',

  accent: '#14503f',
  accentPressed: '#0e3d30',
  onAccent: '#ffffff',
  accentSoft: '#e8f0ec',
  accentLine: '#b9d3c8',

  gold: '#8a6a1f',
  goldSoft: '#fbf3e0',
  goldLine: '#e8d5a8',

  danger: '#8f2d2d',
  dangerSoft: '#fbedeb',
  dangerLine: '#edc7c2',

  // The tab bar and headers sit on their own ground so content can scroll
  // under them without the edge disappearing.
  chrome: '#ffffff',
  chromeLine: '#e4ded3',

  scrim: 'rgba(22, 32, 28, 0.4)',
};

const dark: Palette = {
  bg: '#121614',
  bgSunk: '#0d100f',
  surface: '#1a201d',
  surfaceAlt: '#212824',
  pressed: '#28312c',

  ink: '#eef1ee',
  ink2: '#b3bfb9',
  ink3: '#83948c',

  line: '#2c3733',
  lineStrong: '#3b4842',

  accent: '#6fc4a4',
  accentPressed: '#86d3b6',
  onAccent: '#0b1a14',
  accentSoft: '#16302a',
  accentLine: '#2b4d43',

  gold: '#d9b26a',
  goldSoft: '#2b2417',
  goldLine: '#473b23',

  danger: '#ef9b95',
  dangerSoft: '#2e1c1b',
  dangerLine: '#4c2e2c',

  chrome: '#1a201d',
  chromeLine: '#2c3733',

  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const palettes: Record<Scheme, Palette> = { light, dark };

/** A four-point grid. Everything spatial is a multiple of it. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * `serif` is the brand voice and is used for one thing only: the name of a
 * person who has died, and the screen titles that carry weight. Using it for
 * body text would make the app look like the website.
 */
export const type = {
  display: { fontSize: 26, lineHeight: 32, fontWeight: '600' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  // Section headers above a list. Small, spaced, never shouted.
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
} as const;

/**
 * Arabic is set larger than the surrounding text and with much more leading.
 * Naskh needs the room, and this text is read aloud, often in poor light,
 * standing up.
 */
export const arabic = {
  large: { fontSize: 28, lineHeight: 52 },
  body: { fontSize: 24, lineHeight: 46 },
} as const;

/**
 * Motion. Short, and always in service of showing where something came from.
 * Every duration here is multiplied by zero when the system reports a
 * reduce-motion preference; see src/theme/motion.ts.
 */
export const motion = {
  fast: 140,
  base: 220,
  slow: 320,
  // Matches --ease in the web stylesheet, so the two products decelerate the
  // same way even though nothing else about their motion is shared.
  easing: [0.2, 0.8, 0.3, 1] as const,
} as const;

/**
 * The minimum touch target. Android's guidance is 48dp and this app has an
 * older-than-average audience, so nothing tappable goes below it, including
 * icon-only buttons that look smaller than they are.
 */
export const HIT_SLOP_MIN = 48;
