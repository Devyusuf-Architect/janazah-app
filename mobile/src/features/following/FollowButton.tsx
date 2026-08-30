// Follow and unfollow.
//
// Optimistic, because the local list is written first and is what every
// screen reads, so there is nothing to wait for. The account mirror happens
// behind it and its failure is silent by design: a slow connection outside a
// masjid must not stand between somebody and following it.
//
// Following grants nothing. It is a preference on the reader's own device and
// in their own account document, and firestore.rules recognises no
// relationship between a follower and an organization anywhere else. The
// rules tests say so in those words.

import React, { useState } from 'react';

import { Button } from '../../components/Button';
import { useFollows } from './useFollows';

export function FollowButton({ orgId, size = 'compact' }: {
  orgId: string;
  size?: 'regular' | 'compact';
}) {
  const { isFollowing, toggle, ready, atLimit } = useFollows();
  const [busy, setBusy] = useState(false);
  const following = isFollowing(orgId);

  return (
    <Button
      label={following ? 'Following' : 'Follow'}
      kind={following ? 'secondary' : 'primary'}
      size={size}
      busy={busy}
      disabled={!ready || (atLimit && !following)}
      accessibilityHint={following
        ? 'Stops showing notices from this masjid in Following'
        : 'Shows notices from this masjid in Following'}
      onPress={async () => {
        setBusy(true);
        try {
          await toggle(orgId);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
