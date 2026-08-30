// The alert state a screen needs, and keeping the subscription in step.
//
// The subscription is a function of three things the reader controls
// separately: the alert preferences, their position, and the masjids they
// follow. Any of the three changing means the device is subscribed to the
// wrong set until it re-syncs, so this watches all three and sends the
// difference. Only the difference: moving a few kilometres should not
// re-subscribe to everything.
//
// Nothing here writes a position anywhere. The cell topics are computed on
// the device and sent as topic names, which identify areas several kilometres
// across, and the backend acts on the request and discards it.

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  enable as enablePush, disable as disablePush, syncTopics,
  permissionState, isEnabled, ensureChannel, PushError,
  type PermissionState,
} from '../../lib/notifications';
import { desiredTopics } from '../../lib/topics';
import { clear as clearInbox, read as readInbox, type InboxEntry } from './inbox';
import { prune } from './reminders';
import { useLocation } from '../nearby/useLocation';
import { useFollows } from '../following/useFollows';

export type AlertsState = {
  ready: boolean;
  /** Whether this device holds a messaging token. */
  on: boolean;
  permission: PermissionState;
  busy: boolean;
  error: string | null;
  /** What this device has been told about. Device-local; see inbox.ts. */
  inbox: InboxEntry[];
  /** How many topics the device is currently subscribed to. */
  topicCount: number;
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
  refreshInbox: () => Promise<void>;
};

export function useAlerts(): AlertsState {
  const location = useLocation();
  const follows = useFollows();

  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxEntry[]>([]);

  // What the last sync was for, so a re-render does not re-send it.
  const lastSynced = useRef<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // The channel has to exist before any message can arrive, and it cannot
      // be created in response to one.
      await ensureChannel();
      prune();
      const [enabled, state, entries] = await Promise.all([
        isEnabled(), permissionState(), readInbox(),
      ]);
      if (cancelled) return;
      setOn(enabled);
      setPermission(state);
      setInbox(entries);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const topics = desiredTopics(location.prefs, location.point, follows.ids);

  // Re-sync whenever the answer changes, and not otherwise.
  useEffect(() => {
    if (!ready || !on || !location.ready || !follows.ready) return;
    const signature = topics.join('|');
    if (signature === lastSynced.current) return;
    lastSynced.current = signature;
    syncTopics(location.prefs, location.point, follows.ids).catch(() => {
      // A failed sync leaves the device subscribed to what it had, which is
      // stale rather than wrong, and the next change tries again.
      lastSynced.current = '';
    });
  }, [ready, on, location.ready, location.point, location.prefs, follows.ready, follows.ids]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      setOn(true);
      setPermission('granted');
      lastSynced.current = '';
      await syncTopics(location.prefs, location.point, follows.ids);
    } catch (caught) {
      if (caught instanceof PushError) {
        setError(caught.message);
        if (caught.code === 'denied') setPermission('denied');
      } else {
        setError('Notifications could not be turned on just now.');
      }
    } finally {
      setBusy(false);
    }
  }, [location.prefs, location.point, follows.ids]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      // Off means off: the record of what this device was told about goes
      // with the subscription.
      await clearInbox();
      setInbox([]);
      setOn(false);
      lastSynced.current = '';
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    ready,
    on,
    permission,
    busy,
    error,
    inbox,
    topicCount: topics.length,
    turnOn,
    turnOff,
    refreshInbox: async () => setInbox(await readInbox()),
  };
}
