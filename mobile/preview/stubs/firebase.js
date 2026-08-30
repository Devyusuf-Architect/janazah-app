// Firebase, for the design harness only.
//
// The harness renders components, not a working app: nothing here talks to a
// backend, signs anyone in, or reads a notice. The real modules pull React
// Native's native internals through @react-native-firebase, which esbuild
// cannot resolve for a browser, so they are replaced wholesale.
//
// Every function returns the shape a component destructures and nothing more.
// If a component needs more than this to render, that is worth knowing: it
// means the component is doing work that belongs in a hook.

const noop = () => {};
const resolved = () => Promise.resolve(null);

export const getApp = () => ({ name: 'preview' });
export const getAuth = () => ({ currentUser: null });
export const getFirestore = () => ({});
export const getMessaging = () => ({});
export const getFunctions = () => ({});

export const onAuthStateChanged = () => noop;
export const signInAnonymously = async () => ({ user: { uid: 'preview', isAnonymous: true } });
export const signInWithEmailAndPassword = resolved;
export const createUserWithEmailAndPassword = resolved;
export const signInWithCredential = resolved;
export const linkWithCredential = resolved;
export const signOut = resolved;
export const sendPasswordResetEmail = resolved;
export const sendEmailVerification = resolved;
export const updateProfile = resolved;
export const deleteUser = resolved;
export const getMultiFactorResolver = () => null;
export const multiFactor = () => ({ enrolledFactors: [] });
export const GoogleAuthProvider = { credential: () => ({}) };
export const TotpMultiFactorGenerator = {
  FACTOR_ID: 'totp',
  assertionForSignIn: () => ({}),
};
export const AuthorizationStatus = {
  AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0, NOT_DETERMINED: -1,
};

export const collection = () => ({});
export const collectionGroup = () => ({});
export const doc = () => ({});
export const query = () => ({});
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const startAfter = () => ({});
export const serverTimestamp = () => null;
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ docs: [], metadata: { fromCache: false } });
export const setDoc = resolved;
export const addDoc = resolved;
export const updateDoc = resolved;
export const deleteDoc = resolved;
export const connectAuthEmulator = noop;
export const connectFirestoreEmulator = noop;
export const httpsCallable = () => resolved;
export const getToken = resolved;
export const deleteToken = resolved;
export const requestPermission = async () => 1;
export const hasPermission = async () => 1;
export const onMessage = () => noop;
export const onNotificationOpenedApp = () => noop;
export const getInitialNotification = resolved;

export const Timestamp = {
  fromMillis: (ms) => ({ toDate: () => new Date(ms) }),
  now: () => ({ toDate: () => new Date() }),
};

export default {};
