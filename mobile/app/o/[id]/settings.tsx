// Organization settings, and the one destructive action in it.
//
// The settings themselves are thin on purpose: staff management, verification
// documents and publishing all live in the web console, which is where that
// work is done and where the screens for it already exist. What is here is
// what an owner needs on a phone, and the reason this screen exists at all is
// the last row on it.
//
// Withdrawing a registration.
//
// Organizations are never deleted. firestore.rules has said `allow delete: if
// false` since the beginning, and it says it for a good reason: the audit
// trail has to keep pointing at something, and a masjid that published a
// janazah notice cannot be made to have never existed. So the honest action
// is not a delete, and this screen does not call it one.
//
// What it is: setting verificationStatus to 'withdrawn', which the rules
// permit only for the owner and only from pending, needs_information or
// rejected. A withdrawn organization leaves the public directory, cannot
// publish, and keeps every record it ever had. An administrator can put it
// back to pending, so a mistake here is recoverable.
//
// A verified masjid cannot be withdrawn from here, and the screen says why
// rather than showing a button that would be refused. Leaving with published
// notices behind it is a platform decision, not an applicant's.

import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../../src/components/ScreenHeader';
import { Text } from '../../../src/components/Text';
import { Button } from '../../../src/components/Button';
import { Surface, Divider } from '../../../src/components/Surface';
import { Row } from '../../../src/components/Row';
import { Sheet } from '../../../src/components/Sheet';
import { Field } from '../../../src/components/Field';
import { OrgStatusBadge } from '../../../src/components/Badge';
import { Loading, Empty } from '../../../src/components/States';
import { openConsole } from '../../../src/features/org/ManageCard';
import { useOrganization } from '../../../src/lib/queries';
import { useAuth } from '../../../src/lib/auth';
import { withdrawOrganization } from '../../../src/lib/org';
import {
  canEditOrg, canManageNotices, canWithdrawOrg, orgRole, roleLabel,
} from '../../../src/lib/org-role';
import { failed, succeeded } from '../../../src/lib/haptics';
import { space } from '../../../src/theme';

/**
 * What has to be typed to withdraw.
 *
 * A second tap is not a decision, it is a reflex, and this is the one action
 * on the screen that an administrator has to undo. Typing the word is a few
 * seconds of friction in exchange for never doing this by accident.
 */
const CONFIRM_WORD = 'WITHDRAW';

export default function OrganizationSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAnonymous } = useAuth();
  const { data: org, isPending, refetch } = useOrganization(id);

  const role = orgRole(org, user && !isAnonymous ? user.uid : null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!org) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawOrganization(org.id);
      succeeded();
      setSheetOpen(false);
      await refetch();
      // Back to the masjid page, which now shows the withdrawn state, rather
      // than leaving somebody on a settings screen for a registration that
      // has just ended.
      router.back();
    } catch {
      failed();
      setError(
        'That could not be completed. Check your connection and try again. '
        + 'Nothing has been changed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Organization Settings' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle title="Organization Settings" subtitle={org?.name} />

        {isPending ? <Loading label="Loading this masjid" /> : null}

        {!isPending && !canEditOrg(role) ? (
          <View style={{ paddingHorizontal: space.lg }}>
            <Empty
              message={
                'Only the people who run this masjid can reach its settings.'
              }
            />
          </View>
        ) : null}

        {org && canEditOrg(role) ? (
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <Surface padded style={{ gap: space.sm }}>
              <Text variant="label">Status</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <OrgStatusBadge status={org.verificationStatus} />
              </View>
              <Text variant="callout" tone="muted">
                You are listed as {roleLabel(role).toLowerCase()} of this masjid.
                {canManageNotices(role, org)
                  ? ' It is verified, so it can publish Janazah notices.'
                  : ' It cannot publish Janazah notices at the moment.'}
              </Text>
            </Surface>

            <Surface style={{ overflow: 'hidden' }}>
              <Row
                title="Edit Masjid"
                subtitle="Name, address and contact details"
                onPress={() => router.push(`/o/${org.id}/edit`)}
              />
              <Divider inset={space.lg} />
              <Row
                title="Manage Janazahs"
                subtitle="Publishing happens in the Ta’ziyah console"
                onPress={openConsole}
              />
              <Divider inset={space.lg} />
              <Row
                title="Staff and verification"
                subtitle="Also in the console, where the documents are"
                onPress={openConsole}
              />
            </Surface>

            {canWithdrawOrg(role, org) ? (
              <Surface padded style={{ gap: space.sm }}>
                <Text variant="label">Withdraw this submission</Text>
                <Text variant="callout" tone="muted">
                  If you registered this masjid by mistake, or twice, or have
                  decided not to go ahead, you can withdraw it. It stops
                  appearing anywhere and it cannot publish. Nothing is deleted,
                  and a Ta’ziyah administrator can reopen it if you change your
                  mind.
                </Text>
                <View style={{ alignSelf: 'flex-start', paddingTop: space.xs }}>
                  <Button
                    label="Withdraw submission"
                    kind="danger"
                    onPress={() => { setTyped(''); setError(null); setSheetOpen(true); }}
                  />
                </View>
              </Surface>
            ) : null}

            {role === 'owner' && !canWithdrawOrg(role, org) ? (
              <Surface padded style={{ gap: space.sm }}>
                <Text variant="label">Closing this masjid</Text>
                <Text variant="callout" tone="muted">
                  {org.verificationStatus === 'verified'
                    ? 'A verified masjid is closed by Ta’ziyah rather than '
                      + 'from here, so that notices it has already published '
                      + 'and the record of who published them stay intact. '
                      + 'Write to us and an administrator will take it from '
                      + 'there.'
                    : org.verificationStatus === 'withdrawn'
                      ? 'This registration has been withdrawn. It is not '
                        + 'listed anywhere and it cannot publish. Nothing was '
                        + 'deleted, so an administrator can reopen it for '
                        + 'review if you change your mind.'
                      : 'This registration is not in a state you can withdraw. '
                        + 'A Ta’ziyah administrator can tell you where it '
                        + 'stands and what happens next.'}
                </Text>
              </Surface>
            ) : null}

            <Text variant="caption" tone="subtle">
              Every change here is recorded in this masjid’s history against
              the account that made it.
            </Text>
          </View>
        ) : null}
      </ScreenScroll>

      <Sheet
        visible={sheetOpen}
        onClose={() => { if (!busy) setSheetOpen(false); }}
        title="Withdraw this submission?"
        subtitle={org?.name}
      >
        <View style={{ gap: space.md }}>
          <Text variant="callout" tone="muted">
            This masjid stops appearing in Ta’ziyah and cannot publish Janazah
            notices. Nothing is deleted, and an administrator can reopen it.
          </Text>

          <Field
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          {error ? <Text variant="callout" tone="danger">{error}</Text> : null}

          <Button
            label="Withdraw submission"
            kind="danger"
            size="large"
            full
            busy={busy}
            disabled={typed.trim().toUpperCase() !== CONFIRM_WORD}
            onPress={withdraw}
          />
          <Button
            label="Keep this masjid"
            kind="plain"
            full
            disabled={busy}
            onPress={() => setSheetOpen(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
