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
  authDomain: 'taziyah.com',
  projectId: 'janaza-app-5baf2',
  storageBucket: 'janaza-app-5baf2.firebasestorage.app',
  messagingSenderId: '471694085674',
  appId: '1:471694085674:web:9c5e33b529985e47bfbd53',
};

export const APP = {
  name: "Ta'ziyah",

  // ---------------------------------------------------------------------
  // SAMPLE DATA. Set to false before this site is public.
  // ---------------------------------------------------------------------
  //
  // While true, the app shows the fictional notices in
  // public/js/sample-data.js alongside anything real, so testers see a
  // populated site. Every one of them is named "Sample ..." or "Fulan ...",
  // and a banner sits at the top of every page saying they are examples,
  // because a fake Janazah notice that reads as real is the single most
  // harmful thing this app could show.
  //
  // Turning this off is the whole removal process: one word here. Nothing is
  // written to the database, so there is nothing to clean up afterwards.
  // (scripts/sample-data-live.mjs is the other option, which writes real
  // documents to a real project and needs credentials. This flag needs
  // neither, and works before the security rules are deployed.)
  sampleData: true,
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
  // Continue with Google is off while the custom domain's OAuth redirect URI
  // isn't registered yet in Google Cloud Console (taziyah.com switched from
  // the *.firebaseapp.com authDomain). Email/password sign-in is unaffected.
  // Flip back to true once that's added there.
  googleSignIn: false,
};
