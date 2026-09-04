// Choosing a maps app.
//
// The options come from public/js/geo.js, shared with the web app, so the
// three URL shapes are written once. Waze is absent when a place has no
// coordinates, because it has no address-based mode and a link that opens to
// nothing is worse than one fewer option.
//
// A sheet rather than a menu: three targets at the bottom of the screen, in
// reach of a thumb, for somebody who is probably already walking to their car.
// The sheet chrome itself is src/components/Sheet.tsx, shared with the radius
// and appearance sheets so all three behave identically.

import React from 'react';
import { Linking, View } from 'react-native';

import { Sheet } from '../../components/Sheet';
import { Row } from '../../components/Row';
import { Divider } from '../../components/Surface';
import { space } from '../../theme';
import { directionsOptions, type MapDestination } from '../../shared/geo';

export function DirectionsSheet({ destination, onClose }: {
  destination: MapDestination | null;
  onClose: () => void;
}) {
  const options = destination ? directionsOptions(destination) : [];

  const open = async (href: string) => {
    onClose();
    // A device without the app installed falls back to the browser, which
    // every one of these URLs also works in.
    await Linking.openURL(href).catch(() => {});
  };

  return (
    <Sheet
      visible={!!destination}
      onClose={onClose}
      title="Directions"
      subtitle={[destination?.name, destination?.address].filter(Boolean).join(', ')}
    >
      {options.map((option, index) => (
        <View key={option.key}>
          {index > 0 ? <Divider inset={space.lg} /> : null}
          <Row title={option.label} onPress={() => open(option.href)} />
        </View>
      ))}
    </Sheet>
  );
}
