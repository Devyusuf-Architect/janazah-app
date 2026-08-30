// List or map.
//
// A segmented control rather than two tabs or an icon that swaps: both states
// are visible at once, so it is obvious that the other one exists and which
// one is showing. Whichever is chosen is remembered for the device only. It is
// a property of how somebody likes to read a screen on their own phone, not
// something to synchronize to their account.

import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '../../components/Text';
import { useColors, radius, space } from '../../theme';

export type NearbyView = 'list' | 'map';

export function ViewToggle({ value, onChange, mapAvailable }: {
  value: NearbyView;
  onChange: (next: NearbyView) => void;
  mapAvailable: boolean;
}) {
  const colors = useColors();
  // Without a Maps API key the map renders blank tiles, which looks like a
  // bug rather than a missing key. Hiding the toggle is the honest state.
  if (!mapAvailable) return null;

  const options: { value: NearbyView; label: string }[] = [
    { value: 'list', label: 'List' },
    { value: 'map', label: 'Map' },
  ];

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        padding: 2,
        borderRadius: radius.md,
        backgroundColor: colors.bgSunk,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${option.label} view`}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: 36,
              minWidth: 68,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.surface : 'transparent',
              borderWidth: 1,
              borderColor: selected ? colors.line : 'transparent',
            }}
          >
            <Text
              variant="label"
              style={{ color: selected ? colors.ink : colors.ink3 }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
