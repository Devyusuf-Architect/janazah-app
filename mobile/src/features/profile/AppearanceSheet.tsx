// Light, dark, or follow the phone.
//
// Three options and no more. Text size is deliberately absent: Android
// already has a display-wide font scale, this app respects it everywhere
// (nothing sets allowFontScaling to false), and a second scale on top of it
// would fight the first. The screen says where the real setting is instead of
// offering a worse copy of it.
//
// The choice is device-local and does not travel with the account. A phone at
// night and a desktop at work are different contexts, and somebody who picked
// dark on one has not asked for it on the other.

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../components/Text';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { useColors, useTheme, radius, space, type ThemeChoice } from '../../theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match my phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { choice, setChoice } = useTheme();
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
            <Text variant="heading">Appearance</Text>
          </View>

          {OPTIONS.map((option, index) => (
            <View key={option.value}>
              {index > 0 ? <Divider inset={space.lg} /> : null}
              <Row
                title={option.label}
                note={option.value === choice ? 'Selected' : undefined}
                onPress={() => { setChoice(option.value); onClose(); }}
              />
            </View>
          ))}

          <View style={{ padding: space.lg }}>
            <Text variant="caption" tone="subtle">
              Text size follows your phone’s own setting, in Android Settings
              under Display, then Display size and text. Ta’ziyah uses whatever
              you have chosen there.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
