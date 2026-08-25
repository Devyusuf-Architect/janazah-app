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
  apiKey: 'AIzaSyBWYAmlSHrBFIiHu5C_gwSaPqGULyHPqQs',
  authDomain: 'janaza-app-5baf2.firebaseapp.com',
  projectId: 'janaza-app-5baf2',
  storageBucket: 'janaza-app-5baf2.firebasestorage.app',
  messagingSenderId: '471694085674',
  appId: '1:471694085674:web:9c5e33b529985e47bfbd53',
};

export const APP = {
  name: "Ta'ziyah",
  // Web Push certificate key pair, from
  // Firebase console > Project settings > Cloud Messaging > Web configuration.
  // Like the config above this is a public identifier, not a secret: it lets a
  // browser register for push and grants nothing else. Leave it as-is and push
  // stays switched off with a clear message rather than failing oddly.
  vapidKey: 'REPLACE_ME_WEB_PUSH_CERTIFICATE_KEY',
  // Geohash precision used for the alert cell grid. 5 characters is roughly
  // 5 km x 5 km. Phase 1 only stamps the cell onto records; Phase 4 routes
  // notifications with it.
  cellPrecision: 5,
  // Default IANA zone offered when composing a notice.
  defaultTimeZone: 'America/Toronto',
  // How long after the prayer a notice stays in the "current" feed.
  currentWindowHours: 6,
};
