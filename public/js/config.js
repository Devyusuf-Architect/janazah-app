// Firebase web config.
//
// These values are NOT secrets. They identify the project; they grant no
// access. Access is decided entirely by firestore.rules. Committing them is
// normal and intended. Never put a service account key in this repo.
//
// Replace the placeholders with the config shown in
// Firebase console > Project settings > Your apps > Web app.
// See docs/phase-1-setup.md step 4.

export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

export const APP = {
  name: 'Janazah Notices',
  // Geohash precision used for the alert cell grid. 5 characters is roughly
  // 5 km x 5 km. Phase 1 only stamps the cell onto records; Phase 4 routes
  // notifications with it.
  cellPrecision: 5,
  // Default IANA zone offered when composing a notice.
  defaultTimeZone: 'America/Toronto',
  // How long after the prayer a notice stays in the "current" feed.
  currentWindowHours: 6,
};
