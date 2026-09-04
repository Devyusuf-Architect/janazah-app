// Alerts.
//
// The controls for what should reach this phone, and what already has.
//
// The permission is asked for here and nowhere else, and only after this
// screen has said what will be sent. Android 13 and later shows its prompt on
// the first request and never again, so spending it on a cold launch, before
// anybody has any reason to want notifications, spends it badly.
//
// Everything on this screen except the followed-masjid switch and the radius
// belongs to this device: the permission, the messaging token, the topic
// subscriptions and the list of what arrived. The two that do travel with an
// account say so.

import React, { useCallback, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../src/components/Screen';
import { ScreenHeader, PageTitle } from '../src/components/ScreenHeader';
import { Text } from '../src/components/Text';
import { Button } from '../src/components/Button';
import { Surface, Divider } from '../src/components/Surface';
import { Row } from '../src/components/Row';
import { Loading, Empty } from '../src/components/States';
import { useAlerts } from '../src/features/alerts/useAlerts';
import { useLocation } from '../src/features/nearby/useLocation';
import { useFollows } from '../src/features/following/useFollows';
import { RadiusSheet } from '../src/features/nearby/RadiusSheet';
import { SETTINGS_HINT } from '../src/lib/notifications';
import { RADIUS_OPTIONS } from '../src/lib/nearby';
import { space, useColors } from '../src/theme';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const alerts = useAlerts();
  const location = useLocation();
  const follows = useFollows();
  const [radiusOpen, setRadiusOpen] = useState(false);

  useFocusEffect(useCallback(() => { alerts.refreshInbox(); }, []));

  const radiusLabel = RADIUS_OPTIONS
    .find((o) => o.km === location.prefs.radiusKm)?.label ?? '';

  return (
    <Screen>
      <ScreenHeader />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      >
        <PageTitle
          title="Alerts"
          subtitle="What reaches this phone, and where it comes from."
        />
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          {!alerts.ready ? <Loading label="Loading" /> : null}

          {alerts.ready && !alerts.on ? (
            <Surface padded style={{ gap: space.md }}>
              <Text variant="bodyStrong">Be told when a Janazah is announced</Text>
              <Text variant="callout" tone="muted">
                Ta’ziyah can tell you when a masjid you follow publishes a
                notice, when one is announced near you, and when a time or
                place changes or a Janazah is cancelled.
              </Text>
              <Text variant="callout" tone="muted">
                Your phone asks to be told about areas, not the other way
                round. We are never sent your location, and there is no way for
                us to ask which phones are in a place.
              </Text>

              {alerts.permission === 'denied' ? (
                <Text variant="callout" tone="muted">{SETTINGS_HINT}</Text>
              ) : (
                <>
                  {alerts.error ? (
                    <Text variant="callout" tone="danger">{alerts.error}</Text>
                  ) : null}
                  <Button
                    label="Turn on alerts"
                    kind="primary"
                    busy={alerts.busy}
                    onPress={alerts.turnOn}
                  />
                </>
              )}
            </Surface>
          ) : null}
        </View>

        {alerts.ready && alerts.on ? (
          <>
            <View style={{ padding: space.lg, gap: space.lg }}>
              <Surface style={{ overflow: 'hidden' }}>
                <SwitchRow
                  title="Masjids I follow"
                  subtitle={follows.ids.length
                    ? `${follows.ids.length} followed. This travels with your account.`
                    : 'You are not following any masjids yet.'}
                  value={location.prefs.followAlerts}
                  onChange={(next) => location.update({ followAlerts: next })}
                />
                <Divider inset={space.lg} />
                <SwitchRow
                  title="Janazahs near me"
                  subtitle={location.point
                    ? `Within ${radiusLabel} of where you are.`
                    : 'Turn on location in Nearby to use this.'}
                  value={location.prefs.alertScope !== 'follows' && !!location.point}
                  disabled={!location.point}
                  onChange={(next) =>
                    location.update({ alertScope: next ? 'nearby' : 'follows' })}
                />
                {location.point && location.prefs.alertScope !== 'follows' ? (
                  <>
                    <Divider inset={space.lg} />
                    <Row
                      title="How far"
                      note={radiusLabel}
                      onPress={() => setRadiusOpen(true)}
                    />
                  </>
                ) : null}
              </Surface>

              <Text variant="caption" tone="subtle">
                {alerts.topicCount === 0
                  ? 'This phone is not subscribed to anything, so nothing will '
                    + 'reach it. Follow a masjid, or turn on Janazahs near me.'
                  : `This phone is subscribed to ${alerts.topicCount} `
                    + `${alerts.topicCount === 1 ? 'area or masjid' : 'areas and masjids'}. `
                    + 'Areas are several kilometres across, and nothing records '
                    + 'which ones this phone asked for.'}
              </Text>
            </View>

            <View style={{ paddingHorizontal: space.lg }}>
              <Text
                variant="overline"
                tone="subtle"
                style={{ textTransform: 'uppercase' }}
              >
                Recently
              </Text>
            </View>

            {alerts.inbox.length === 0 ? (
              <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
                <Empty message="Nothing yet. Alerts you receive appear here so you can find one you dismissed." />
              </View>
            ) : (
              <Surface style={{ margin: space.lg, overflow: 'hidden' }}>
                {alerts.inbox.map((entry, index) => (
                  <View key={entry.noticeId}>
                    {index > 0 ? <Divider inset={space.lg} /> : null}
                    <Row
                      title={
                        entry.kind === 'cancelled' ? 'A Janazah was cancelled'
                          : entry.kind === 'updated' ? 'A Janazah was updated'
                          : 'A Janazah was announced'
                      }
                      subtitle={new Date(entry.at).toLocaleString()}
                      onPress={() => router.push(`/n/${entry.noticeId}`)}
                    />
                  </View>
                ))}
              </Surface>
            )}

            <View style={{ padding: space.lg, gap: space.md }}>
              <Text variant="caption" tone="subtle">
                This list is on this phone only. Turning alerts off clears it.
              </Text>
              <Button
                label="Turn off alerts"
                onPress={alerts.turnOff}
                busy={alerts.busy}
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      <RadiusSheet
        visible={radiusOpen}
        value={location.prefs.radiusKm}
        onPick={location.setRadius}
        onClose={() => setRadiusOpen(false)}
      />
    </Screen>
  );
}

function SwitchRow({ title, subtitle, value, onChange, disabled }: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        minHeight: 56,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="muted">{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        trackColor={{ false: colors.lineStrong, true: colors.accent }}
        thumbColor={colors.surface}
      />
    </View>
  );
}
