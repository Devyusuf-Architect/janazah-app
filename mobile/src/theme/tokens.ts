// The design system.
//
// The brand is unchanged: the same dark green, the same warm parchment, the
// same gold. What changed is that the first version used one flat background
// everywhere and let hairline borders carry the whole interface, which reads
// as unfinished rather than as calm. This version gives the app a floor, a
// surface and a raised surface, so hierarchy comes from depth as well as from
// type.
//
// Three rules that shape everything below.
//
//   1. Layers, not shadows. Elevation is a lighter surface plus a hairline,
//      with a shadow only on things that genuinely float: a sheet, the tab
//      bar, a pressed card. Shadows on every row read as clutter at arm's
//      length and render inconsistently across Android versions.
//   2. Restraint with the accent. Green is for actions and for the verified
//      mark. Gold is for the one thing on a screen that needs attention: a
//      correction, a time that has moved. If everything is accented, nothing
//      is.
//   3. Type is set once, here, with line heights that hold at 130% font
//      scale. A funeral notice is often read by somebody with the system font
//      size turned up, and it has to survive that without reflowing into
//      nonsense.

export type Scheme = 'light' | 'dark';

/**
 * The colour roles. Named by what they are for, never by what they look like,
 * so that "surface" is still correct in the dark scheme where it is nearly
 * black.
 */
export type Palette = {
  /** The floor. Nothing sits behind this. */
  bg: string;
  /** Recessed areas: grouped list backgrounds, the ground under a card. */
  bgSunk: string;
  /** A card or panel sitting on the floor. */
  surface: string;
  /** A surface on a surface: an inset block inside a card. */
  surfaceAlt: string;
  /** A surface that is being pressed. */
  pressed: string;
  /** The deep green ground used on the launch screens and headers. */
  brand: string;
  /** A step deeper, for the gradient-free layering on brand grounds. */
  brandDeep: string;
  /** Text and marks on a brand ground. */
  onBrand: string;
  /** Muted text on a brand ground. */
  onBrandMuted: string;

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

  /** Tab bar and headers. */
  chrome: string;
  chromeLine: string;

  scrim: string;
  /** The sweep colour for a loading skeleton. */
  shimmer: string;
};

const light: Palette = {
  bg: '#f7f3ec',
  bgSunk: '#efe9df',
  surface: '#fffdfa',
  surfaceAlt: '#f4efe6',
  pressed: '#e9e2d5',

  brand: '#0f3d30',
  brandDeep: '#0a2c23',
  onBrand: '#f7f3ec',
  onBrandMuted: '#a8c4b8',

  ink: '#141c19',
  ink2: '#3d4b45',
  ink3: '#6b7c74',

  line: '#e2dacd',
  lineStrong: '#cfc5b4',

  accent: '#14503f',
  accentPressed: '#0d3c2e',
  onAccent: '#ffffff',
  accentSoft: '#e4eee9',
  accentLine: '#b3d0c4',

  gold: '#8a6a1f',
  goldSoft: '#faf1dd',
  goldLine: '#e6d2a2',

  danger: '#8f2d2d',
  dangerSoft: '#fbeae8',
  dangerLine: '#eec4bf',

  chrome: '#fffdfa',
  chromeLine: '#e2dacd',

  scrim: 'rgba(15, 30, 24, 0.45)',
  shimmer: 'rgba(255, 255, 255, 0.55)',
};

const dark: Palette = {
  bg: '#0e1412',
  bgSunk: '#080d0b',
  surface: '#161e1a',
  surfaceAlt: '#1d2723',
  pressed: '#26312c',

  brand: '#0a2c23',
  brandDeep: '#061c17',
  onBrand: '#eaf1ed',
  onBrandMuted: '#8aa79a',

  ink: '#eef2ef',
  ink2: '#b2c0b9',
  ink3: '#7f938a',

  line: '#27332e',
  lineStrong: '#38463f',

  accent: '#6fc4a4',
  accentPressed: '#8ad4b8',
  onAccent: '#08221a',
  accentSoft: '#132d26',
  accentLine: '#2a4b41',

  gold: '#d9b26a',
  goldSoft: '#2a2317',
  goldLine: '#4a3c22',

  danger: '#ef9b95',
  dangerSoft: '#2e1b1a',
  dangerLine: '#4d2e2c',

  chrome: '#121a17',
  chromeLine: '#27332e',

  scrim: 'rgba(0, 0, 0, 0.65)',
  shimmer: 'rgba(255, 255, 255, 0.07)',
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
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Elevation. Deliberately only three levels, and only the top two carry a
 * shadow at all.
 *
 * `sheet` is for something that genuinely floats over the screen. `raised` is
 * for a card the eye should read as lifted. Everything else is flat and uses
 * a border, because a shadow under every row is what makes an interface look
 * busy rather than deep.
 */
export const elevation = {
  flat: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  raised: {
    shadowColor: '#0b1a14',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0b1a14',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
} as const;

/**
 * Type scale.
 *
 * `serif` is the brand voice and is used for three things only: the name of a
 * person who has died, screen titles, and the wordmark. Body text in the
 * serif would make the app look like the website rendered small.
 */
export const type = {
  hero: { fontSize: 34, lineHeight: 40, fontWeight: '700' },
  display: { fontSize: 26, lineHeight: 32, fontWeight: '600' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Section headers above a list. Small, spaced, never shouted. */
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** The time on a notice. The largest thing on a row, on purpose. */
  timeLarge: { fontSize: 22, lineHeight: 27, fontWeight: '700' },
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
 * Motion.
 *
 * Short, and always in service of showing where something came from. Every
 * duration here becomes zero when the system reports a reduce-motion
 * preference; see src/theme/motion.ts.
 */
export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 340,
  /** How long a list waits between each row appearing. */
  stagger: 45,
  /** Matches --ease in the web stylesheet, so both products decelerate alike. */
  easing: [0.2, 0.8, 0.3, 1] as const,
  /** For something arriving: a little overshoot, never a bounce. */
  spring: { damping: 18, stiffness: 180, mass: 0.9 } as const,
  /** For a press: fast, tight, no wobble. */
  press: { damping: 26, stiffness: 420, mass: 0.6 } as const,
} as const;

/**
 * The minimum touch target. Android's guidance is 48dp and this app has an
 * older-than-average audience, so nothing tappable goes below it, including
 * icon-only buttons that look smaller than they are.
 */
export const HIT_SLOP_MIN = 48;
