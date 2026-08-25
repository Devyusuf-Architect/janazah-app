// Stands in for public/js/firebase.js in the standalone preview.
// There is no project, no network, and no credentials.
export const app = { name: 'preview' };
export const auth = { currentUser: { uid: 'preview-visitor', email: null } };
export const db = { type: 'preview' };
export const usingEmulator = false;
