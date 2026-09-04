// A reminder for one Janazah.
//
// Scheduled on this phone, never on the server. A reminder list held by the
// backend would be a record of which funerals a person intends to attend,
// which is exactly what this application has gone out of its way not to hold.
// The honest consequence is on the button's own explanation: it stays on this
// phone.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { succeeded, tapped } from '../../lib/haptics';
import { space } from '../../theme';
import { set, cancel, isSet, fireAt, LEAD_MINUTES } from './reminders';
import type { Notice } from '../../lib/notice';

export function ReminderButton({ notice }: { notice: Notice }) {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const possible = fireAt(notice) !== null;

  useEffect(() => {
    let cancelled = false;
    isSet(notice.id).then((value) => {
      if (cancelled) return;
      setOn(value);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [notice.id]);

  // A cancelled Janazah does not get a reminder, and one already set is
  // removed: being reminded to attend something that is not happening is the
  // worst version of this feature.
  useEffect(() => {
    if (notice.status === 'cancelled' && on) {
      cancel(notice.id).then(() => setOn(false));
    }
  }, [notice.status, on, notice.id]);

  if (!ready || !possible || notice.status === 'cancelled') return null;

  return (
    <View style={{ gap: space.xs }}>
      <Button
        label={on ? 'Reminder set' : 'Remind me'}
        kind={on ? 'secondary' : 'secondary'}
        busy={busy}
        accessibilityHint={on
          ? 'Removes the reminder on this phone'
          : `Sets a reminder ${LEAD_MINUTES} minutes before the prayer, on this phone`}
        onPress={async () => {
          setBusy(true);
          try {
            if (on) {
              await cancel(notice.id);
              setOn(false);
              tapped();
            } else {
              const ok = await set(notice) === 'set';
              setOn(ok);
              // A reminder is a promise the app is making, so it confirms
              // rather than merely acknowledging.
              if (ok) succeeded();
            }
          } finally {
            setBusy(false);
          }
        }}
      />
      {on ? (
        <Text variant="caption" tone="subtle">
          An hour and a half before, on this phone only.
        </Text>
      ) : null}
    </View>
  );
}
