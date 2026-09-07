// Editing a masjid's own details.
//
// Reachable only from the management card, which appears only for the owner
// and staff. That is presentation. The enforcement is firestore.rules, which
// checks ownerUid and staffUids against request.auth on the write itself, so
// this screen opening for the wrong person would still save nothing.
//
// What is deliberately not here: verification status, ownership, the staff
// list. The rules refuse all three from a client, and src/lib/org.ts has no
// code path that sends them, which is the stronger of the two statements.
//
// The map position is derived from the address rather than typed. Somebody
// correcting a street name should not have to know a coordinate, and a
// coordinate typed by hand is a coordinate that can be wrong in a way nobody
// notices until a family drives to it. If the geocoder cannot place the new
// address the edit still saves and the screen says the pin was left alone.

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';

import { Screen, ScreenScroll } from '../../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../../src/components/ScreenHeader';
import { Text } from '../../../src/components/Text';
import { Field } from '../../../src/components/Field';
import { Button } from '../../../src/components/Button';
import { Surface } from '../../../src/components/Surface';
import { Loading, Empty } from '../../../src/components/States';
import { useOrganization } from '../../../src/lib/queries';
import { useAuth } from '../../../src/lib/auth';
import { saveOrganizationProfile } from '../../../src/lib/org';
import {
  canEditOrg, draftFrom, draftProblem, orgRole, type OrgDraft,
} from '../../../src/lib/org-role';
import { succeeded } from '../../../src/lib/haptics';
import { space } from '../../../src/theme';

export default function EditOrganizationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAnonymous } = useAuth();
  const { data: org, isPending } = useOrganization(id);

  const role = orgRole(org, user && !isAnonymous ? user.uid : null);

  const [draft, setDraft] = useState<OrgDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filled once, from the first load. Refilling it on every render would
  // overwrite what somebody is in the middle of typing.
  const form = draft ?? (org ? draftFrom(org) : null);
  const set = (field: keyof OrgDraft) => (value: string) => {
    if (!form) return;
    setDraft({ ...form, [field]: value });
    setNotice(null);
  };

  async function save() {
    if (!org || !form) return;
    const problem = draftProblem(form);
    if (problem) { setError(problem); return; }

    setBusy(true);
    setError(null);
    try {
      const result = await saveOrganizationProfile(org, form);
      succeeded();
      if (result.keptOldPosition) {
        // Saved, but say what did not happen. An address and a map pin that
        // disagree is worth one sentence now rather than a wrong pin later.
        setNotice(
          'Saved. The new address could not be placed on the map, so the '
          + 'existing map position was kept. You can move it from the '
          + 'Ta’ziyah console.',
        );
        return;
      }
      router.back();
    } catch {
      setError(
        'That change could not be saved. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Edit Masjid' }} />
      <ScreenHeader />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScreenScroll>
          <PageTitle title="Edit Masjid" />

          {isPending ? <Loading label="Loading this masjid" /> : null}

          {!isPending && !canEditOrg(role) ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <Empty
                message={
                  'Only the people who run this masjid can edit it. If that '
                  + 'should be you, ask its owner to add you as staff.'
                }
              />
            </View>
          ) : null}

          {org && form && canEditOrg(role) ? (
            <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
              <Field
                label="Name"
                value={form.name}
                onChangeText={set('name')}
                autoCapitalize="words"
                maxLength={140}
              />
              <Field
                label="Street address"
                value={form.address}
                onChangeText={set('address')}
                autoCapitalize="words"
                hint="The map position is worked out from this when you save."
              />
              <Field
                label="City"
                value={form.city}
                onChangeText={set('city')}
                autoCapitalize="words"
              />
              <Field
                label="Province"
                value={form.province}
                onChangeText={set('province')}
                autoCapitalize="words"
              />
              <Field
                label="Postal code"
                value={form.postalCode}
                onChangeText={set('postalCode')}
                autoCapitalize="characters"
              />
              <Field
                label="Contact email"
                value={form.contactEmail}
                onChangeText={set('contactEmail')}
                autoCapitalize="none"
                keyboardType="email-address"
                hint="Where Ta’ziyah writes to you about this masjid."
              />
              <Field
                label="Phone"
                value={form.phone}
                onChangeText={set('phone')}
                keyboardType="phone-pad"
              />
              <Field
                label="Website"
                value={form.website}
                onChangeText={set('website')}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://"
              />

              {error ? (
                <Text variant="callout" tone="danger">{error}</Text>
              ) : null}
              {notice ? (
                <Surface padded>
                  <Text variant="callout" tone="muted">{notice}</Text>
                </Surface>
              ) : null}

              <View style={{ gap: space.sm }}>
                <Button
                  label="Save changes"
                  kind="primary"
                  size="large"
                  full
                  busy={busy}
                  onPress={save}
                />
                <Button
                  label="Cancel"
                  kind="plain"
                  full
                  disabled={busy}
                  onPress={() => router.back()}
                />
              </View>

              <Text variant="caption" tone="subtle">
                Changes are recorded against your account in this masjid’s
                history. Verification status, ownership and the staff list are
                not edited here.
              </Text>
            </View>
          ) : null}
        </ScreenScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}
