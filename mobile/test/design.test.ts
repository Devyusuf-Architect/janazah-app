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

test('a tab is called the same thing in the bar and on its own screen', () => {
  // Two names for one section is how somebody ends up looking for a screen
  // they have already found. Home is exempt: it has a branded header rather
  // than a page title.
  const layout = read(resolve(root, 'app/(tabs)/_layout.tsx'));
  const titles = new Map<string, string>();
  for (const match of layout.matchAll(/name: '(\w+)', title: '([^']+)'/g)) {
    titles.set(String(match[1]), String(match[2]));
  }
  assert.equal(titles.size, 5, 'the tabs list did not parse');

  for (const [route, title] of titles) {
    const screen = read(resolve(root, `app/(tabs)/${route}.tsx`));
    const page = screen.match(/<PageTitle title="([^"]+)"/)?.[1];
    if (!page) continue;
    assert.equal(
      page, title,
      `the ${route} tab is labelled "${title}" in the bar and "${page}" on the screen`,
    );
  }
});

test('every tab has a glyph of its own', () => {
  // Two tabs sharing an icon is the same bug as two tabs sharing a word.
  const bar = read(resolve(root, 'src/components/TabBar.tsx'));
  const block = bar.match(/TAB_ICONS[^{]*\{([^}]*)\}/)?.[1] ?? '';
  const icons = [...block.matchAll(/:\s*'(\w+)'/g)].map((m) => String(m[1]));
  assert.equal(icons.length, 5, 'TAB_ICONS did not parse');
  assert.equal(new Set(icons).size, icons.length, 'two tabs share an icon');

  const glyphs = read(resolve(root, 'src/components/TabIcon.tsx'));
  for (const icon of icons) {
    assert.match(
      glyphs, new RegExp(`name === '${icon}'`),
      `TabIcon draws nothing for '${icon}', so that tab would show a blank box`,
    );
  }
});

test('nothing offers an organization action without checking the role', () => {
  // Presentation, not enforcement: firestore.rules checks ownerUid and
  // staffUids against request.auth on every write, so a card shown to the
  // wrong person would still save nothing. What this pins is that the app
  // does not put management controls in front of a family looking up a
  // janazah time, and does not offer a button whose write is going to be
  // refused.
  const gated = [
    'src/features/org/ManageCard.tsx',
    'app/o/[id]/edit.tsx',
    'app/o/[id]/settings.tsx',
  ];
  for (const file of gated) {
    const source = code(resolve(root, file));
    assert.match(
      source, /canEditOrg\(/,
      `${file} shows organization management without asking who is looking`,
    );
  }
});

test('the app never writes an organization field the rules reserve', () => {
  // src/lib/org.ts is the only module that writes an organization document.
  // Verification status is the one exception, and only as the withdrawal the
  // rules permit an owner to make.
  const source = code(resolve(root, 'src/lib/org.ts'));
  for (const reserved of [
    'ownerUid', 'staffUids', 'verifiedBy', 'verifiedAt', 'statusReason',
    'createdBy', 'createdAt',
  ]) {
    assert.equal(
      source.includes(reserved), false,
      `src/lib/org.ts writes ${reserved}, which belongs to the rules`,
    );
  }
  assert.match(source, /verificationStatus: 'withdrawn'/);
});

test('no organization document is written outside src/lib/org.ts', () => {
  // Reading one happens in several places and is fine. Writing one is the
  // whole surface the rules guard, so it lives in a single module where the
  // test above can check what it sends.
  const offenders = files
    .filter((file) => name(file) !== 'src/lib/org.ts')
    .filter((file) => {
      const source = code(file);
      return source.includes("'organizations'")
        && /\b(updateDoc|setDoc|deleteDoc|addDoc)\s*\(/.test(source);
    })
    .map(name);
  assert.deepEqual(offenders, []);
});

test('a destructive organization action is confirmed before it runs', () => {
  // A second tap is a reflex. Withdrawing a registration is the one action
  // in the app that a platform administrator has to undo.
  const settings = code(resolve(root, 'app/o/[id]/settings.tsx'));
  assert.match(settings, /<Sheet/, 'withdrawal is not behind a confirmation sheet');
  assert.match(settings, /CONFIRM_WORD/, 'withdrawal takes no typed confirmation');
  assert.match(settings, /disabled=\{typed/, 'the confirm button is not gated on the typed word');
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

test('no component takes a prop it never uses', () => {
  // This exists because of a real one. A refactor of the notice screen moved
  // two blocks around and dropped the row carrying the reminder and "Report
  // a problem"; the onReport prop was still declared, still typed and still
  // passed in, and nothing failed, so the only route to reporting a
  // fraudulent notice was quietly unreachable.
  //
  // Counting every mention of the name is not enough, which was the first
  // version of this test and why it passed against the bug: the name also
  // appears in the props type. So type positions are excluded, and what is
  // left is uses.
  const offenders: string[] = [];

  for (const file of files) {
    const source = code(file);
    for (const match of source.matchAll(/function\s+\w+\s*\(\s*\{([^}]*)\}/g)) {
      for (const raw of (match[1] ?? '').split(',')) {
        // Skip defaults, renames and rest: those read differently.
        const prop = raw.trim();
        if (!prop || prop.includes('=') || prop.includes(':') || prop.startsWith('...')) continue;

        // Every mention that is not "prop:" or "prop?:", which are the shapes
        // a name takes in a type rather than in code, and not the
        // destructuring itself.
        const mentions = [...source.matchAll(new RegExp(`\\b${prop}\\b\\s*(\\??:)?`, 'g'))];
        const uses = mentions.filter((m) => !m[1]).length;
        if (uses <= 1) offenders.push(`${name(file)}: ${prop}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
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

test('no expected auth failure raises the development LogBox', () => {
  // console.error and console.warn both open LogBox, which throws a red
  // full-screen overlay over the app. On a sign-in screen that is actively
  // harmful: the failure is already on screen with a proper message, and the
  // overlay hides the log line you opened the build to read. Everything
  // diagnostic goes through src/lib/auth-log.ts, which uses console.log.
  const offenders = files
    .filter((file) => code(file).match(/console\.(error|warn)\s*\(/))
    .map(name);
  assert.deepEqual(offenders, []);
});

test('the auth log never truncates a message', () => {
  // The first version of authError shortened any string over eighty
  // characters to "<86 chars>", and the one string it did that to was the
  // Firebase message naming the cause. Only credentials are redacted now.
  const source = read(resolve(root, 'src/lib/auth-log.ts'));
  assert.match(source, /token, \$\{value\.length\} chars/);
  assert.equal(/\bvalue\.length > \d+\b/.test(code(resolve(root, 'src/lib/auth-log.ts'))), false);
});
