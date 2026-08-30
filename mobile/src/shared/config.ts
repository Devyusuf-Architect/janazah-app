// Constants shared with the web app, restated rather than re-exported.
//
// public/js/config.js is not importable here: it carries the Web Push VAPID
// key and a Firebase web config that mean nothing to a native client, which
// gets its project details from google-services.json instead. So the handful
// of values that must agree across both clients are restated, and
// test/shared.test.ts reads public/js/config.js and fails if any of them
// drifts apart.

/** Geohash precision for the alert cell grid. Must match the web and functions. */
export const CELL_PRECISION = 5;

/** How long after the prayer a notice stays in the "current" feed. */
export const CURRENT_WINDOW_HOURS = 6;

/** Default IANA zone. Notices carry their own; this is only a fallback. */
export const DEFAULT_TIME_ZONE = 'America/Toronto';

export const APP_NAME = "Ta'ziyah";
