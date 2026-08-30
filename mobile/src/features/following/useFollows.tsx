// Following, as the app sees it.
//
// One provider at the root, because four screens read the follow list and two
// of them change it, and a hook holding its own copy per screen would let two
// of them disagree about whether a masjid is followed.
//
// The order of operations is the design, not an implementation detail:
// the local list is written first and every screen reads it, so a follow is
// instant and cannot fail; the account mirror follows behind and its failure
// is silent. Somebody standing outside a masjid on one bar of signal should
// not watch a spinner to follow it.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';

import {
  readLocal, writeLocal, readAccount, writeAccount, accountUid,
} from '../../lib/follows';
import { union, sanitisePrefs, MAX_FOLLOWS, type SyncedPrefs } from '../../lib/follow-merge';
import { readPrefs, writePrefs } from '../../lib/location';
import { useAuth } from '../../lib/auth';

type FollowsValue = {
  ready: boolean;
  ids: string[];
  isFollowing: (orgId: string) => boolean;
  toggle: (orgId: string) => Promise<boolean>;
  /** True while a real account is mirroring the list. */
  synced: boolean;
  atLimit: boolean;
};

const FollowsContext = createContext<FollowsValue | null>(null);

export function FollowsProvider({ children }: { children: React.ReactNode }) {
  const { user, ready: authReady } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(false);
  // Which account has already been merged, so signing in once does not
  // re-merge on every auth event React hands us.
  const mergedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readLocal().then((local) => {
      if (cancelled) return;
      setIds(local);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // The merge, once per sign-in.
  useEffect(() => {
    if (!authReady || !ready) return;
    const uid = user && !user.isAnonymous ? user.uid : null;

    if (!uid) {
      // Signed out. The local list stays exactly as it is: somebody who signs
      // out has not asked to stop following anything.
      mergedFor.current = null;
      setSynced(false);
      return;
    }
    if (mergedFor.current === uid) return;
    mergedFor.current = uid;

    let cancelled = false;
    (async () => {
      const remote = await readAccount(uid);
      if (cancelled) return;

      const local = await readLocal();
      const merged = union(local, remote?.followedOrgIds ?? []);
      if (cancelled) return;

      if (merged.length !== local.length) {
        await writeLocal(merged);
        setIds(merged);
      }

      // Alert preferences: the account's win when it has them, because that
      // is where the choice was last made deliberately. Their effect stays
      // local, since each device recomputes its own topic subscription from
      // them.
      if (remote?.prefs) await writePrefs(remote.prefs);

      const prefs = await writePrefsSnapshot();
      if (cancelled) return;
      await writeAccount(uid, merged, prefs);
      setSynced(true);
    })();

    return () => { cancelled = true; };
  }, [authReady, ready, user]);

  const toggle = useCallback(async (orgId: string): Promise<boolean> => {
    const current = await readLocal();
    const following = current.includes(orgId);
    const next = following
      ? current.filter((id) => id !== orgId)
      : union(current, [orgId]);

    // Local first, and the screen updates from this. The mirror is behind it.
    const stored = await writeLocal(next);
    setIds(stored);

    const uid = accountUid();
    if (uid) writeAccount(uid, stored, await writePrefsSnapshot());

    return !following;
  }, []);

  const value = useMemo<FollowsValue>(() => ({
    ready,
    ids,
    isFollowing: (orgId: string) => ids.includes(orgId),
    toggle,
    synced,
    atLimit: ids.length >= MAX_FOLLOWS,
  }), [ready, ids, toggle, synced]);

  return (
    <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>
  );
}

/** The current alert preferences, in the shape the rules accept. */
async function writePrefsSnapshot(): Promise<SyncedPrefs | null> {
  const prefs = await readPrefs();
  return sanitisePrefs({
    radiusKm: prefs.radiusKm,
    alertScope: prefs.alertScope,
    followAlerts: prefs.followAlerts,
  });
}

export function useFollows(): FollowsValue {
  const value = useContext(FollowsContext);
  if (!value) throw new Error('useFollows called outside FollowsProvider');
  return value;
}
