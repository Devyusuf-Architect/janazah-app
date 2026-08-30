// The location state a screen needs, in one hook.
//
// Home and Nearby both want the same three things: the stored point, the
// preferences, and a way to ask for a fresh fix. Holding that here means the
// permission flow is written once and both screens behave identically, which
// matters because the wrong version of "location is off" on one of them would
// be the app quietly contradicting itself about something it makes a promise
// about.
//
// Nothing here reaches Firestore. See the guard in test/location.test.ts.

import { useCallback, useEffect, useState } from 'react';

import {
  readPoint, readPrefs, writePrefs, disable as disableLocation,
  permissionState, requestPosition, LocationError,
} from '../../lib/location';
import {
  isStale, type LocationPrefs, type PermissionState, type Point,
} from '../../lib/nearby';

export type LocationState = {
  ready: boolean;
  point: Point | null;
  prefs: LocationPrefs;
  permission: PermissionState;
  busy: boolean;
  error: string | null;
  /** True when the stored point is old enough that it should be refreshed. */
  stale: boolean;
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
  setRadius: (km: number) => Promise<void>;
  turnOff: () => Promise<void>;
};

const INITIAL_PREFS: LocationPrefs = {
  enabled: false,
  radiusKm: 10,
  alertScope: 'nearby',
  followAlerts: true,
};

export function useLocation(): LocationState {
  const [ready, setReady] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [prefs, setPrefs] = useState<LocationPrefs>(INITIAL_PREFS);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedPrefs, storedPoint, state] = await Promise.all([
        readPrefs(), readPoint(), permissionState(),
      ]);
      if (cancelled) return;
      setPrefs(storedPrefs);
      // A stored point is only used while the feature is on. Leaving it
      // readable after somebody has switched off would make "off" a lie, and
      // disable() erases it anyway; this is the belt to that pair of braces.
      setPoint(storedPrefs.enabled ? storedPoint : null);
      setPermission(state);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchPosition = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await requestPosition();
      setPoint(next);
      setPrefs(await writePrefs({ enabled: true }));
      setPermission('granted');
    } catch (caught) {
      if (caught instanceof LocationError) {
        setError(caught.message);
        // A permanent denial changes which screen the reader should see, not
        // just which message. Recording it here is what switches the gate from
        // "here is why, may we?" to "here is where the setting lives".
        if (caught.code === 'blocked') setPermission('denied');
        if (caught.code === 'unavailable') setPermission('unavailable');
      } else {
        setError('Your location could not be read just now.');
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    ready,
    point,
    prefs,
    permission,
    busy,
    error,
    stale: prefs.enabled && isStale(point),
    enable: fetchPosition,
    refresh: fetchPosition,
    setRadius: async (km) => { setPrefs(await writePrefs({ radiusKm: km })); },
    turnOff: async () => {
      // Erases the stored point as well as clearing the flag. Opting out has
      // to actually delete.
      setPrefs(await disableLocation());
      setPoint(null);
      setError(null);
    },
  };
}
