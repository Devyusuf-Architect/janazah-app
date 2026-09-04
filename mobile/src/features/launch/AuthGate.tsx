// The account requirement.
//
// The mobile app requires an account. Everything under (tabs) and every
// detail route is behind this; the (launch) group is not, because that is
// where somebody goes to get one.
//
// An anonymous session does not count. The app still opens one at launch,
// because the reports endpoint and the topic-subscription callable both need
// something to attribute and rate limit against, but it is a handle rather
// than an identity and it must not open the door.
//
// One thing worth knowing about this decision, recorded here because it is
// the kind of thing that gets rediscovered painfully: a hard wall means a
// shared link to taziyah.com/n/{id}, and a notification tap on a phone whose
// session has expired, both land on sign-in rather than on the notice. The
// web site keeps its anonymous browsing and is untouched; this is a mobile
// routing rule and nothing in the shared modules changed to make it.

import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '../../lib/auth';

export function useAuthGate(): void {
  const { user, ready, isAnonymous } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;

    const group = segments[0];
    // The splash decides where to send somebody on a cold start, including
    // whether they have seen the welcome. Redirecting out from under it would
    // race that decision and skip onboarding.
    const inLaunch = group === '(launch)' || group === undefined;
    const signedIn = !!user && !isAnonymous;

    if (!signedIn && !inLaunch) {
      // Signed out from inside the app: a sign-out, or a token that expired
      // while the app was closed.
      router.replace('/(launch)/signin');
    }
  }, [ready, user, isAnonymous, segments]);
}
