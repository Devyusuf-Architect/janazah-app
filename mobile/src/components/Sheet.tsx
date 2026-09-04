// A bottom sheet.
//
// Three screens had grown their own copy of this: the same scrim, the same
// grabber, the same rounded top and the same safe-area padding, written out
// three times and already drifting apart. This is the one of them.
//
// It is a sheet rather than a menu because the targets belong at the bottom
// of the screen, in reach of a thumb, for somebody who is often already
// walking to their car.
//
// Reduce motion turns the slide off. React Native's Modal has no way to
// shorten the animation, only to remove it, which is the right answer here
// anyway: somebody who asked their phone to stop animating asked for the
// sheet to be there, not to travel.

import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useColors, radius, space, elevation } from '../theme';
import { useReduceMotion } from '../theme/motion';

export function Sheet({ visible, onClose, title, subtitle, children }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduce ? 'none' : 'slide'}
      // Android's back gesture closes the sheet rather than leaving the
      // screen, which is what a sheet should do.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          // Swallows taps so pressing the sheet itself does not dismiss it.
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderTopWidth: 1,
            borderColor: colors.line,
            paddingBottom: insets.bottom + space.sm,
            ...elevation.sheet,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: space.sm }}>
            <View
              // Decorative. It says "this can be dragged" to a sighted user
              // and nothing at all to a screen reader, which is correct: the
              // scrim above already carries the Close label.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 36, height: 4, borderRadius: 2,
                backgroundColor: colors.lineStrong,
              }}
            />
          </View>

          <View style={{ padding: space.lg, paddingBottom: space.sm, gap: 2 }}>
            <Text accessibilityRole="header" variant="heading">{title}</Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
