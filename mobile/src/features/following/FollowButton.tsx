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
//
// The two states have to be told apart at a glance, and colour alone will not
// do it: the difference between a filled green button and an outlined one is
// invisible to a good number of the people this app is for. So the followed
// state carries a tick as well, and the accessibility state says which it is
// rather than leaving a screen reader to infer it from the word "Following".

import React, { useState } from 'react';
import Svg, { Path } from 'react-native-svg';

import { Button } from '../../components/Button';
import { tapped } from '../../lib/haptics';
import { useColors } from '../../theme';
import { useFollows } from './useFollows';

export function FollowButton({ orgId, size = 'compact', full = false }: {
  orgId: string;
  size?: 'regular' | 'compact';
  full?: boolean;
}) {
  const colors = useColors();
  const { isFollowing, toggle, ready, atLimit } = useFollows();
  const [busy, setBusy] = useState(false);
  const following = isFollowing(orgId);

  return (
    <Button
      label={following ? 'Following' : 'Follow'}
      kind={following ? 'secondary' : 'primary'}
      size={size}
      full={full}
      busy={busy}
      disabled={!ready || (atLimit && !following)}
      icon={following ? <Tick color={colors.accent} /> : null}
      accessibilityState={{ selected: following, disabled: !ready }}
      accessibilityHint={following
        ? 'Stops showing notices from this masjid in Following'
        : 'Shows notices from this masjid in Following'}
      onPress={async () => {
        setBusy(true);
        try {
          await toggle(orgId);
          // The tap confirms the app heard a decision the person made. The
          // write is local and instant, so this never fires ahead of the
          // state it is confirming.
          tapped();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function Tick({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="m5 12.5 4.5 4.5L19 7"
        stroke={color} strokeWidth={2.4}
        strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </Svg>
  );
}
