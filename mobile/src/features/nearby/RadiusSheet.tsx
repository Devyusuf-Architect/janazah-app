// Choosing how far "near me" reaches.
//
// The same five options as the web app, so a radius means the same thing on
// both, and "Any distance" is kept because somebody in a small city may have
// no masjid within fifty kilometres and would otherwise see an empty screen
// and conclude the app is broken.
//
// The sheet chrome is src/components/Sheet.tsx, shared with the directions
// and appearance sheets.

import React from 'react';
import { View } from 'react-native';

import { Sheet } from '../../components/Sheet';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { space } from '../../theme';
import { RADIUS_OPTIONS } from '../../lib/nearby';

export function RadiusSheet({ visible, value, onPick, onClose }: {
  visible: boolean;
  value: number;
  onPick: (km: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="How far">
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
    </Sheet>
  );
}
