// Checks the two things this project needs that npm cannot install for you,
// and says plainly what to do about each. Runs automatically before `npm run
// demo` and `npm test`.
//
// Both failures are otherwise confusing: Java because nothing else here uses
// it, and the Node version because it only shows as a warning during install
// and then as odd behaviour much later.

import { execFileSync } from 'node:child_process';

const SUPPORTED_NODE = [20, 22, 24];
const problems = [];

// --- Node ---------------------------------------------------------------

const major = Number(process.versions.node.split('.')[0]);
if (major < Math.min(...SUPPORTED_NODE)) {
  problems.push({
    what: `Node ${process.versions.node} is too old.`,
    fix: 'Install the LTS release from https://nodejs.org and reopen your terminal.',
  });
} else if (!SUPPORTED_NODE.includes(major)) {
  problems.push({
    what: `Node ${process.versions.node} is newer than the Firebase tools support `
      + `(they expect ${SUPPORTED_NODE.join(', ')}).`,
    fix: 'Install the LTS release from https://nodejs.org, or if you use nvm:\n'
      + '        nvm install 24 && nvm use 24\n'
      + '      Then delete node_modules and run npm install again.',
  });
}

// --- Java ---------------------------------------------------------------

try {
  execFileSync('java', ['-version'], { stdio: 'ignore' });
} catch {
  problems.push({
    what: 'Java is not installed, and the Firebase emulators are Java programs.',
    fix: process.platform === 'darwin'
      ? 'Download the macOS installer from https://adoptium.net (the site picks\n'
        + '      the right one for your Mac), run it, then close and reopen your terminal.\n'
        + '      With Homebrew: brew install --cask temurin'
      : 'Install a JDK from https://adoptium.net, then reopen your terminal.',
  });
}

// ------------------------------------------------------------------------

if (problems.length) {
  const line = '─'.repeat(68);
  console.error(`\n${line}`);
  console.error('  Before this can run, two things need sorting out.\n');
  for (const [i, p] of problems.entries()) {
    console.error(`  ${i + 1}. ${p.what}`);
    console.error(`      ${p.fix}\n`);
  }
  console.error(`  Check with:  node --version   and   java -version`);
  console.error(`${line}\n`);
  process.exit(1);
}
