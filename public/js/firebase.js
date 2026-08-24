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
  document.documentElement.innerHTML =
    '<pre style="padding:2rem;font:14px/1.6 ui-monospace,monospace">' +
    'Firebase is not configured yet.\n\n' +
    'Edit public/js/config.js and paste the config from\n' +
    'Firebase console > Project settings > Your apps > Web app.\n\n' +
    'Full steps: docs/phase-1-setup.md' +
    '</pre>';
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
  console.info('Connected to Firebase emulators. Append ?live=1 to use production.');
}
