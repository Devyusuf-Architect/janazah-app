// The design rules that a type checker cannot see.
//
// Every one of these is a property the redesign is supposed to hold across
// the whole app, and every one of them is the kind of thing that decays
// silently: somebody adds a screen, copies the nearest file, and the copy is
// from before the rule existed. Checked structurally, over the source, in the
// same spirit as test/location.test.ts.
//
// These are guard rails, not taste. None of them says a screen is well
// designed; they say a screen has not quietly fallen out of the system.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sources(full)); continue; }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...sources(resolve(root, 'app')), ...sources(resolve(root, 'src'))];
const read = (file: string) => readFileSync(file, 'utf8');

/**
 * The same source with comments removed.
 *
 * Needed because these tests search for code shapes, and several of the
 * shapes are also quoted in the comments that explain them. The first version
 * of the reduce-motion test failed on the sentence in Motion.tsx describing
 * what it exists to prevent.
 */
const code = (file: string) => read(file)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const name = (file: string) => relative(root, file);

test('colours come from the palette, never from a literal', () => {
  // Three exceptions, each with its reason written at the point of use: the
  // logo, which is one colour in both schemes; the notification channel,
  // which the system reads with no app running; and the tokens file itself.
  const allowed = new Set([
    'src/theme/tokens.ts',
    'src/features/launch/Brandmark.tsx',
    'src/lib/notifications.ts',
  ]);

  const offenders = files
    .filter((file) => !allowed.has(name(file)))
    .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(code(file)))
    .map(name);

  assert.deepEqual(offenders, [], `hard-coded colours in: ${offenders.join(', ')}`);
});

test('nothing switches off the phone’s font scale', () => {
  // The audience skews older and the system font size is often turned up. An
  // allowFontScaling={false} anywhere is a screen that ignores that.
  const offenders = files
    .filter((file) => /allowFontScaling\s*=\s*\{?\s*false/.test(code(file)))
    .map(name);

  assert.deepEqual(offenders, []);
});

test('every entering animation goes through the reduce-motion check', () => {
  // Animated.View entering={...} is the one place the check can be skipped,
  // so it is only allowed where the value comes from src/theme/motion.ts
  // (enterRow, enterScreen, exitScreen), which all return undefined when the
  // system asks for no animation.
  const offenders: string[] = [];

  for (const file of files) {
    for (const match of code(file).matchAll(/(entering|exiting)=\{([^}]*)\}/g)) {
      const value = match[2] ?? '';
      if (!/enterRow|enterScreen|exitScreen/.test(value)) {
        offenders.push(`${name(file)}: ${match[0]}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('the tab bar and the tab routes agree', () => {
  // A route added to app/(tabs)/ without an icon in TAB_ICONS renders as a
  // gap in the bar, because the bar skips what it has no glyph for.
  const layout = read(resolve(root, 'app/(tabs)/_layout.tsx'));
  const bar = read(resolve(root, 'src/components/TabBar.tsx'));

  const routes = readdirSync(resolve(root, 'app/(tabs)'))
    .filter((entry) => /\.tsx$/.test(entry) && entry !== '_layout.tsx')
    .map((entry) => entry.replace(/\.tsx$/, ''));

  for (const route of routes) {
    assert.match(
      layout, new RegExp(`name: '${route}'`),
      `app/(tabs)/${route}.tsx is not listed in the tabs layout`,
    );
    assert.match(
      bar, new RegExp(`^\\s+${route}:`, 'm'),
      `app/(tabs)/${route}.tsx has no icon in TAB_ICONS`,
    );
  }
});

test('no screen ships its own back button any more', () => {
  // ScreenHeader is the one back affordance. A Button labelled "Back" in the
  // content is what the app looked like before the redesign.
  const offenders = files
    .filter((file) => /label="Back"/.test(code(file)))
    .map(name);

  assert.deepEqual(offenders, []);
});

test('the development banner cannot reach a release build', () => {
  // It names the backend and the emulator host, which is useful in
  // development and noise on a shipped app. The guard has to be an early
  // return on __DEV__ so the minifier drops the branch entirely.
  const banner = read(resolve(root, 'src/components/DevBanner.tsx'));
  assert.match(banner, /if \(!__DEV__[^)]*\) return null;/);

  // And nothing else renders it conditionally on something weaker.
  const layout = read(resolve(root, 'app/_layout.tsx'));
  assert.ok(layout.includes('<DevBanner />'), 'the banner is no longer mounted');
});

test('no screen builds its own bottom sheet', () => {
  // src/components/Sheet.tsx owns the scrim, the grabber and the
  // reduce-motion behaviour. Three screens had drifting copies of it once.
  const offenders = files
    .filter((file) => name(file) !== 'src/components/Sheet.tsx')
    .filter((file) => /<Modal[\s>]/.test(code(file)))
    .map(name);

  assert.deepEqual(offenders, []);
});
