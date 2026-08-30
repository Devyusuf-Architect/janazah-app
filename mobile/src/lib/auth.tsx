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
  onAuthStateChanged,
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

export type Role = {
  isAdmin: boolean;
  /** Organizations this account is staff of. Empty for a community member. */
  staffOrgIds: string[];
};

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

const EMPTY_ROLE: Role = { isAdmin: false, staffOrgIds: [] };

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
      return;
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      // Anything other than "this identity is already an account" is a real
      // failure and should surface rather than be swallowed by a fallback.
      const alreadyExists = code === 'auth/credential-already-in-use'
        || code === 'auth/email-already-in-use'
        || code === 'auth/account-exists-with-different-credential';
      if (!alreadyExists) throw error;
    }
  }
  await signInWithCredential(getAuth(), credential);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>(EMPTY_ROLE);
  // Guards against two anonymous sign-ins racing on a cold start.
  const bootstrapping = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (next) => {
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
      } catch {
        // The rules allow reading only your own admin row; a denial means no.
        isAdmin = false;
      }
      if (!cancelled) setRole({ isAdmin, staffOrgIds: [] });
    })();

    return () => { cancelled = true; };
  }, [user]);

  const value = useMemo<AuthValue>(() => ({
    user,
    ready,
    isAnonymous: !!user?.isAnonymous,
    role,

    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password);
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
    },

    signInWithGoogleCredential: async (idToken) => {
      await linkOrSignIn(GoogleAuthProvider.credential(idToken));
    },

    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email.trim());
    },

    resendVerification: async () => {
      const current = auth.currentUser;
      if (current) await sendEmailVerification(current);
    },

    signOut: async () => { await fbSignOut(auth); },
  }), [user, ready, role]);

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
