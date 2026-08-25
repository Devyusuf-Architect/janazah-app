// Firebase initialisation. Auto-connects to the local emulators when served
// from localhost so that rule changes can be tested without touching the
// live project.

import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator,
} from 'firebase/firestore';

import { firebaseConfig as configured } from './config.js';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const unconfigured = configured.apiKey === 'REPLACE_ME';

// A `demo-` project id is emulator-only: the SDK will never reach a real
// backend with it. This lets the emulators be driven before a Firebase project
// exists, which is also what the end-to-end test relies on.
const demoConfig = {
  apiKey: 'demo-key',
  authDomain: 'demo-janazah.firebaseapp.com',
  projectId: 'demo-janazah',
  appId: 'demo-app',
};

const firebaseConfig = unconfigured && isLocal ? demoConfig : configured;

if (unconfigured && !isLocal) {
  // Replacing documentElement.innerHTML drops the linked stylesheet along
  // with everything else in <head>, so this screen carries its own styles
  // rather than depending on styles.css still being attached afterward.
  document.documentElement.innerHTML = `
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ta'ziyah — not configured yet</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        padding: 2rem; background: #faf7f2; color: #16201c;
        font: 16px/1.6 -apple-system, 'Segoe UI', Roboto, sans-serif;
      }
      .card {
        max-width: 34rem; width: 100%; background: #fff; border: 1px solid #e4ded3;
        border-radius: 14px; padding: 2.25rem; box-shadow: 0 1px 2px rgba(22,32,28,.04), 0 6px 20px -8px rgba(22,32,28,.12);
      }
      .mark { font-size: 1.5rem; color: #14503f; }
      h1 {
        margin: .5rem 0 0; font: 600 1.6rem/1.25 Georgia, 'Times New Roman', serif;
        letter-spacing: -0.015em; color: #16201c;
      }
      p { color: #40504a; margin: .9rem 0; }
      ol { color: #40504a; padding-left: 1.2rem; margin: .9rem 0; }
      li { margin: .4rem 0; }
      code {
        background: #f2eee6; border: 1px solid #e4ded3; border-radius: 4px;
        padding: .1em .4em; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      a { color: #14503f; }
    </style></head>
    <body>
      <main class="card">
        <div class="mark" aria-hidden="true">&#9670;</div>
        <h1>Ta'ziyah isn't connected to a Firebase project yet</h1>
        <p>This is a deploy of the app before its Firebase config was set, not an error in the app itself.</p>
        <ol>
          <li>Open <strong>Firebase console &gt; Project settings &gt; Your apps &gt; Web app</strong> and copy the config it shows.</li>
          <li>Paste it into <code>public/js/config.js</code>, replacing the <code>REPLACE_ME</code> placeholders (run <code>npm run setup</code> to do this from the terminal instead).</li>
          <li>Commit and redeploy. These values identify the project only; they are not secrets, and committing them is expected.</li>
        </ol>
        <p>Full walkthrough: <code>docs/phase-1-setup.md</code>.</p>
      </main>
    </body>
  `;
  throw new Error('Firebase config not set. See docs/phase-1-setup.md');
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const usingEmulator =
  isLocal && (unconfigured || !location.search.includes('live=1'));

if (usingEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  window.__janazahEmulator = true;
  console.info('Connected to Firebase emulators. Append ?live=1 to use production.');
}
