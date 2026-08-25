// Writes public/js/config.js from the config Firebase shows you, so the one
// step that involves editing JavaScript by hand does not.
//
//   npm run setup
//
// Paste the whole block from the Firebase console. It reads until it has
// everything it needs, so there is nothing to trim or reformat first.

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const TARGET = 'public/js/config.js';
const KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket',
              'messagingSenderId', 'appId'];

function parse(text) {
  const found = {};
  for (const key of KEYS) {
    const match = text.match(new RegExp(`${key}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
    if (match) found[key] = match[1];
  }
  return found;
}

const line = '─'.repeat(68);
console.log(`\n${line}`);
console.log('  Paste the Firebase config here.\n');
console.log('  Firebase console > ⚙ Project settings > Your apps > the web app,');
console.log('  then copy the whole firebaseConfig block, braces and all.\n');
console.log('  Paste, then press Enter. Ctrl+C to cancel.');
console.log(`${line}\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

let buffer = '';
let config = {};
for await (const chunk of rl) {
  buffer += `${chunk}\n`;
  config = parse(buffer);
  if (KEYS.every((k) => config[k])) break;
}
rl.close();

const missing = KEYS.filter((k) => !config[k]);
if (missing.length) {
  console.error(`\nThat did not contain: ${missing.join(', ')}.`);
  console.error('Copy the whole block from the console, including the braces, and try again.\n');
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{4,}$/.test(config.projectId)) {
  console.error(`\n"${config.projectId}" does not look like a project id. Nothing was written.\n`);
  process.exit(1);
}

const source = readFileSync(TARGET, 'utf8');
let next = source;
for (const key of KEYS) {
  const pattern = new RegExp(`(\\b${key}:\\s*)'[^']*'`);
  if (!pattern.test(next)) {
    console.error(`\n${TARGET} has no ${key} line to replace. Nothing was written.\n`);
    process.exit(1);
  }
  next = next.replace(pattern, `$1'${config[key]}'`);
}

if (next.includes('REPLACE_ME.')) {
  console.error(`\nSomething was left unreplaced in ${TARGET}. Nothing was written.\n`);
  process.exit(1);
}

writeFileSync(TARGET, next);

const stillPlaceholder = next.includes('REPLACE_ME_WEB_PUSH_CERTIFICATE_KEY');

console.log(`\n${line}`);
console.log(`  Written to ${TARGET}\n`);
console.log(`  Project:  ${config.projectId}`);
console.log(`  Site:     https://${config.projectId}.web.app\n`);
if (stillPlaceholder) {
  console.log('  Push notifications are not configured yet, which is fine for now.');
  console.log('  The app will say alerts are unavailable rather than failing oddly.');
  console.log('  To add them later, see docs/phase-4-notes.md.\n');
}
console.log('  Next:   firebase use --add');
console.log('          npm run deploy:rules');
console.log('          firebase deploy --only hosting');
console.log(`${line}\n`);
