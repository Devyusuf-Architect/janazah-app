// What the people who run a masjid see on its page, and nobody else does.
//
// The visibility rule here is a courtesy, not a defence. firestore.rules
// decides every one of these actions against request.auth, so a build with
// this card shown to everybody would grant nothing: the edit screen would
// open and the save would be refused. Hiding it is about not offering
// somebody a door that is locked, and about not putting management controls
// in front of a family looking up a janazah time.
//
// Publishing is not here on purpose, and that is a product decision rather
// than a permission one. Composing a notice, with a name, a time, an address
// and a burial site, is a desk job, and doing it on a phone at the moment it
// matters most is how a wrong address reaches four hundred people. Manage
// Janazahs opens the console, which is where that work belongs.

import React from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';

import { Text } from '../../components/Text';
import { Surface } from '../../components/Surface';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import {
  canEditOrg, canManageNotices, canWithdrawOrg, roleLabel, type OrgRole,
} from '../../lib/org-role';
import type { Organization } from '../../lib/notice';
import { space } from '../../theme';

/** Where a coordinator publishes. The mobile app deliberately does not. */
export const CONSOLE = 'https://taziyah.com/console';

export const openConsole = () => { Linking.openURL(CONSOLE).catch(() => {}); };

export function ManageCard({ org, role }: { org: Organization; role: OrgRole }) {
  if (!canEditOrg(role)) return null;

  const publishing = canManageNotices(role, org);

  return (
    <Surface level="raised" padded style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
            Your organization
          </Text>
          <Badge tone="neutral" label={roleLabel(role)} />
        </View>
        <Text variant="callout" tone="muted">
          {role === 'owner'
            ? 'You registered this masjid, so you can edit it and end its registration.'
            : 'You are listed as staff, so you can edit this masjid’s details.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button
          label="Edit Masjid"
          kind="primary"
          size="compact"
          onPress={() => router.push(`/o/${org.id}/edit`)}
        />
        {publishing ? (
          <Button
            label="Manage Janazahs"
            size="compact"
            accessibilityHint="Opens the Ta’ziyah console in your browser"
            onPress={openConsole}
          />
        ) : null}
        <Button
          label="Organization Settings"
          size="compact"
          onPress={() => router.push(`/o/${org.id}/settings`)}
        />
      </View>

      {!publishing ? (
        <Text variant="caption" tone="subtle">
          {canWithdrawOrg(role, org)
            ? 'Publishing unlocks once a Ta’ziyah administrator verifies this '
              + 'masjid. Until then you can still keep its details up to date.'
            : 'Publishing is not available for this masjid at the moment.'}
        </Text>
      ) : null}
    </Surface>
  );
}
