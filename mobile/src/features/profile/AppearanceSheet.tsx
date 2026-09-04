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
import { View } from 'react-native';

import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { useTheme, space, type ThemeChoice } from '../../theme';

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Match my phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function AppearanceSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const { choice, setChoice } = useTheme();

  return (
    <Sheet visible={visible} onClose={onClose} title="Appearance">
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
    </Sheet>
  );
}
