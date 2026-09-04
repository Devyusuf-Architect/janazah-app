// The way in for somebody who runs a masjid.
//
// It appears on Home for staff of an organization and for nobody else. That
// is a display decision, not a security one: what a coordinator may publish
// is decided by firestore.rules, and this card would grant nothing if it
// appeared for everyone.
//
// It does not publish. Composing a notice, with a name, a time, an address
// and a burial site, is a desk job, and doing it on a phone at the moment it
// matters most is how a wrong address gets sent to four hundred people. The
// card links to the masjid's own page, where its notices are, and says where
// publishing happens.
//
// Verification state is on the card because it answers the question a pending
// coordinator actually has, which is why they cannot publish yet.

import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Text } from '../../components/Text';
import { Surface } from '../../components/Surface';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { useAuth } from '../../lib/auth';
import { useMyOrganizations } from '../../lib/queries';
import { space } from '../../theme';

export function CoordinatorCard() {
  const { user, isAnonymous } = useAuth();
  const uid = user && !isAnonymous ? user.uid : undefined;
  const { data } = useMyOrganizations(uid);

  const orgs = data ?? [];
  if (orgs.length === 0) return null;

  // More than one is rare and does not deserve a carousel: the first is shown
  // and the rest are one tap away in the directory.
  const org = orgs[0]!;
  const verified = org.verificationStatus === 'verified';

  return (
    <Surface level="raised" padded style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
          Your masjid
        </Text>
        <Badge
          tone={verified ? 'verified' : 'neutral'}
          label={verified ? 'Verified' : 'Pending verification'}
        />
      </View>

      <Text variant="title" serif numberOfLines={2}>{org.name}</Text>

      <Text variant="callout" tone="muted">
        {verified
          ? 'Publish and correct notices at taziyah.com. Everything you publish '
            + 'there appears here and reaches the people following you.'
          : 'An administrator is reviewing this masjid. You will be able to '
            + 'publish once it is verified.'}
      </Text>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          label="Open your masjid"
          kind="primary"
          size="compact"
          onPress={() => router.push(`/o/${org.id}`)}
        />
        {orgs.length > 1 ? (
          <Button
            label={`${orgs.length - 1} more`}
            size="compact"
            onPress={() => router.push('/masjids')}
          />
        ) : null}
      </View>
    </Surface>
  );
}
