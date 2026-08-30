// Choosing how far "near me" reaches.
//
// The same five options as the web app, so a radius means the same thing on
// both, and "Any distance" is kept because somebody in a small city may have
// no masjid within fifty kilometres and would otherwise see an empty screen
// and conclude the app is broken.

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { useColors, radius as radii, space } from '../../theme';
import { RADIUS_OPTIONS } from '../../lib/nearby';

export function RadiusSheet({ visible, value, onPick, onClose }: {
  visible: boolean;
  value: number;
  onPick: (km: number) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
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
            <Text variant="heading">How far</Text>
          </View>

          {RADIUS_OPTIONS.map((option, index) => (
            <View key={option.km}>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              <Row
                title={option.label}
                note={option.km === value ? 'Selected' : undefined}
                onPress={() => { onPick(option.km); onClose(); }}
              />
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
