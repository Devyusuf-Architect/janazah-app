// Choosing a maps app.
//
// The options come from public/js/geo.js, shared with the web app, so the
// three URL shapes are written once. Waze is absent when a place has no
// coordinates, because it has no address-based mode and a link that opens to
// nothing is worse than one fewer option.
//
// A sheet rather than a menu: three targets at the bottom of the screen, in
// reach of a thumb, for somebody who is probably already walking to their car.

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { useColors, radius, space } from '../../theme';
import { directionsOptions, type MapDestination } from '../../shared/geo';

export function DirectionsSheet({ destination, onClose }: {
  destination: MapDestination | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const options = destination ? directionsOptions(destination) : [];

  const open = async (href: string) => {
    onClose();
    // A device without the app installed falls back to the browser, which
    // every one of these URLs also works in.
    await Linking.openURL(href).catch(() => {});
  };

  return (
    <Modal
      visible={!!destination}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android's back gesture closes the sheet rather than leaving the
      // screen, which is what a sheet should do.
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          // Swallows taps so pressing the sheet itself does not dismiss it.
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderTopWidth: 1,
            borderColor: colors.line,
            paddingBottom: insets.bottom + space.sm,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <View
              style={{
                width: 36, height: 4, borderRadius: 2,
                backgroundColor: colors.lineStrong,
              }}
            />
          </View>

          <View style={{ padding: space.lg, paddingBottom: space.sm }}>
            <Text variant="heading">Directions</Text>
            {destination?.name || destination?.address ? (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {[destination?.name, destination?.address].filter(Boolean).join(', ')}
              </Text>
            ) : null}
          </View>

          {options.map((option, index) => (
            <View key={option.key}>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              <Row title={option.label} onPress={() => open(option.href)} />
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
