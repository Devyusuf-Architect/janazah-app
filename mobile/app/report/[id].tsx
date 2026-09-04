// Reporting a notice.
//
// Reachable from the notice itself, because that is where somebody notices
// that a time is wrong. Deliberately short: five reasons, an optional note,
// and a send button. A long form between somebody and telling us a funeral
// notice is wrong is a form that does not get filled in.

import React, { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '../../src/components/Screen';
import { ScreenHeader, PageTitle } from '../../src/components/ScreenHeader';
import { Text } from '../../src/components/Text';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { Surface, Divider } from '../../src/components/Surface';
import { Row } from '../../src/components/Row';
import {
  REPORT_REASONS, submitReport, type ReportReason,
} from '../../src/lib/report';
import { useColors, space, radius } from '../../src/theme';

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Thank you' }} />
        <View
          style={{
            flex: 1, justifyContent: 'center',
            paddingHorizontal: space.lg, gap: space.md,
          }}
        >
          <Text variant="title">Thank you</Text>
          <Text variant="body" tone="muted">
            A Ta’ziyah administrator will look at this notice. If it is urgent
            and the prayer is soon, contact the masjid directly as well.
          </Text>
          <Button label="Done" kind="primary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Report a problem' }} />
      <ScreenHeader />
      <ScreenScroll>
        <PageTitle
          title="Report a problem"
          subtitle={'This goes to a Ta’ziyah administrator, not to the masjid. '
            + 'Nothing about you is sent except that the report came from this '
            + 'app.'}
        />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Surface style={{ overflow: 'hidden' }}>
            {REPORT_REASONS.map((option, index) => (
              <View key={option.value}>
                {index > 0 ? <Divider inset={space.lg} /> : null}
                <Row
                  title={option.label}
                  note={reason === option.value ? 'Selected' : undefined}
                  onPress={() => { setReason(option.value); setError(null); }}
                  leading={(
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: reason === option.value ? 6 : 1.5,
                        borderColor: reason === option.value
                          ? colors.accent
                          : colors.lineStrong,
                        backgroundColor: colors.surface,
                      }}
                    />
                  )}
                />
              </View>
            ))}
          </Surface>

          <Field
            label="Anything else we should know"
            hint="Optional. Do not include anyone’s phone number or address."
            value={detail}
            onChangeText={setDetail}
            multiline
            numberOfLines={4}
            maxLength={1000}
            style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: space.md }}
          />

          {error ? <Text variant="callout" tone="danger">{error}</Text> : null}

          <Button
            label="Send report"
            kind="primary"
            full
            busy={busy}
            disabled={!reason}
            onPress={async () => {
              if (!reason || !id) return;
              setBusy(true);
              setError(null);
              try {
                await submitReport(id, reason, detail);
                setSent(true);
              } catch {
                setError(
                  'The report could not be sent. Check your connection and try '
                  + 'again. If the prayer is soon, contact the masjid directly.',
                );
              } finally {
                setBusy(false);
              }
            }}
          />

          <View
            style={{
              padding: space.md,
              borderRadius: radius.md,
              backgroundColor: colors.bgSunk,
            }}
          >
            <Text variant="caption" tone="subtle">
              If you are family and want a notice removed sooner than the usual
              retention period, choose the fourth option. That is the actual
              process, and it is described at taziyah.com/privacy.
            </Text>
          </View>
        </View>
      </ScreenScroll>
    </Screen>
  );
}
