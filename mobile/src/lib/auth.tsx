// Authentication.
//
// The same Firebase project, the same accounts, the same UIDs, the same roles
// as the web app. Nothing about authorization is decided here. The app reads
// /admins/{uid} (its own row, which is all the rules permit anyone to read)
// and the organizations it is staff of, and uses both only to decide what to
// show. Every write it attempts is checked by firestore.rules, so a
// reverse-engineered build gains nothing by drawing a button we did not.
//
// Anonymous sign-in happens on first launch, exactly as on the web: reading
// notices needs no account, while filing a report and managing push topics
// need something to attribute and rate-limit against.

import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  getAuth,
  onIdTokenChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  linkWithCredential,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  GoogleAuthProvider,
  type User,
  type AuthCredential,
} from '@react-native-firebase/auth';
import { getDoc } from '@react-native-firebase/firestore';

import { auth } from './firebase';
import { adminRef } from './collections';
import { authError, authLog } from './auth-log';

export type Role = {
  isAdmin: boolean;
};

// Which organizations an account is staff of is deliberately NOT here. It is
// a Firestore query rather than a claim, it is only needed by one card on
// Home, and putting it in the auth context would mean every screen in the app
// waiting on it. See useMyOrganizations in src/lib/queries.ts.

type AuthValue = {
  user: User | null;
  /** False until Firebase has reported an initial state. */
  ready: boolean;
  /** True while the only session is the anonymous one created on launch. */
  isAnonymous: boolean;
  role: Role;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogleCredential: (idToken: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

const EMPTY_ROLE: Role = { isAdmin: false };

/**
 * Sign in, preserving an anonymous session's work where the provider allows.
 *
 * Someone may follow several masjids before they ever sign in. Linking turns
 * the anonymous UID into the real account, so that work survives. Linking
 * fails when the credential already belongs to an account, which is the
 * ordinary case of an existing web user signing in on their phone; then the
 * app signs in normally and Phase 4 merges the local follow list into the
 * account document instead.
 */
async function linkOrSignIn(
  credential: AuthCredential,
): Promise<void> {
  const current = getAuth().currentUser;
  if (current?.isAnonymous) {
    try {
      await linkWithCredential(current, credential);
      authLog('link ok', { provider: credential.providerId, uid: current.uid });
      return;
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      // Anything other than "this identity is already an account" is a real
      // failure and should surface rather than be swallowed by a fallback.
      const alreadyExists = code === 'auth/credential-already-in-use'
        || code === 'auth/email-already-in-use'
        || code === 'auth/account-exists-with-different-credential';
      if (!alreadyExists) throw error;
      authLog('link declined', {
        code,
        next: 'signInWithCredential',
      });
    }
  }
  await signInWithCredential(getAuth(), credential);
  authLog('credential ok', {
    provider: credential.providerId,
    uid: getAuth().currentUser?.uid ?? null,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>(EMPTY_ROLE);
  // Guards against two anonymous sign-ins racing on a cold start.
  const bootstrapping = useRef(false);

  // onIdTokenChanged, NOT onAuthStateChanged, and the difference is a bug
  // this app actually had.
  //
  // Every launch signs in anonymously, so the current user when somebody taps
  // Continue with Google is an anonymous one, and the first-time path links
  // the Google credential onto it (see linkOrSignIn). Linking does not change
  // the uid, so Android's FirebaseAuth.AuthStateListener does not fire, and
  // react-native-firebase only emits onAuthStateChanged from that listener
  // (its lib/index.ts: _handleAuthStateChanged is driven by the native
  // auth_state_changed event, while the resolved credential goes through
  // _setUserCredential, which emits onUserChanged and nothing else).
  //
  // The result was that React kept the stale anonymous user after a
  // successful Google sign-in: isAnonymous stayed true, useAuthGate decided
  // nobody was signed in, and the moment sign-in navigated to the tabs the
  // gate replaced back to sign-in. The Google flow completed and the app came
  // back with nobody signed in. Email and password were unaffected because
  // they change the uid, which does fire the auth state listener.
  //
  // Linking mints a new ID token, so the id-token listener does fire, and it
  // is a superset: sign-in, sign-out, token refresh and link all reach it.
  useEffect(() => onIdTokenChanged(auth, (next) => {
    authLog('listener', {
      uid: next?.uid ?? null,
      anonymous: next?.isAnonymous ?? null,
      providers: next?.providerData?.map((p) => p.providerId) ?? [],
      email: next?.email ? 'present' : 'none',
    });
    setUser(next);
    setReady(true);

    if (!next && !bootstrapping.current) {
      bootstrapping.current = true;
      signInAnonymously(auth)
        // A failure here means reports and alert subscriptions will not work
        // until the next launch. Reading notices still does, which is the
        // part that matters, so this must not block the app.
        .catch(() => {})
        .finally(() => { bootstrapping.current = false; });
    }
  }), []);

  /**
   * Push the SDK's current user into React, without waiting for an event.
   *
   * Belt and braces after the bug above: every auth action calls this when it
   * resolves, so the app never depends on which listener a given provider
   * happens to trigger. react-native-firebase builds a fresh User object each
   * time (_setUser), so this is a real state change and not a no-op.
   */
  const syncUser = React.useCallback(() => {
    const current = getAuth().currentUser;
    authLog('sync', {
      currentUser: current ? current.uid : null,
      anonymous: current?.isAnonymous ?? null,
    });
    setUser(current);
    setReady(true);
  }, []);

  // Roles are resolved after sign-in rather than assumed. Until this
  // resolves the app simply shows no coordinator affordances, which is the
  // correct default and avoids one flickering into view and out again.
  useEffect(() => {
    let cancelled = false;
    if (!user || user.isAnonymous) { setRole(EMPTY_ROLE); return; }

    (async () => {
      let isAdmin = false;
      try {
        isAdmin = (await getDoc(adminRef(user.uid))).exists();
        authLog('role', { uid: user.uid, admin: isAdmin });
      } catch (error) {
        // The rules allow reading only your own admin row; a denial means no.
        // Logged anyway: a denial and an unreachable backend look identical
        // from here, and only one of them is expected.
        authError('role', error);
        isAdmin = false;
      }
      if (!cancelled) setRole({ isAdmin });
    })();

    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<AuthValue>(() => ({
    user,
    ready,
    isAnonymous: !!user?.isAnonymous,
    role,

    signIn: async (email, password) => {
      authLog('signIn start', { provider: 'password' });
      try {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (error) {
        authError('signIn', error);
        throw error;
      }
      authLog('signIn done', { currentUser: getAuth().currentUser?.uid ?? null });
      syncUser();
    },

    signUp: async (email, password, name) => {
      const { user: created } = await createUserWithEmailAndPassword(
        auth, email.trim(), password,
      );
      if (name?.trim()) await updateProfile(created, { displayName: name.trim() });
      // Sent, not enforced. Owning an inbox says nothing about who someone
      // is, which is why organization verification is a separate process
      // entirely, handled by a human administrator on the web.
      await sendEmailVerification(created).catch(() => {});
      syncUser();
    },

    signInWithGoogleCredential: async (idToken) => {
      authLog('signIn start', { provider: 'google.com' });
      try {
        await linkOrSignIn(GoogleAuthProvider.credential(idToken));
      } catch (error) {
        authError('signIn google.com', error);
        throw error;
      }
      authLog('signIn done', { currentUser: getAuth().currentUser?.uid ?? null });
      // The one that was broken. See the note on onIdTokenChanged above.
      syncUser();
    },

    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email.trim());
    },

    resendVerification: async () => {
      const current = auth.currentUser;
      if (current) await sendEmailVerification(current);
    },

    signOut: async () => {
      authLog('signOut');
      await fbSignOut(auth);
      syncUser();
    },
  }), [user, ready, role, syncUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth called outside AuthProvider');
  return value;
}

/** Signed in with a real account, as opposed to the anonymous launch session. */
export const useSignedIn = (): boolean => {
  const { user } = useAuth();
  return !!user && !user.isAnonymous;
};
