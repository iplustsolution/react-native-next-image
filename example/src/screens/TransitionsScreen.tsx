import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  RESIZE_MODES,
  TRANSITIONS,
  type Cache,
  type Source,
  type Transition,
} from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { colors, shared } from '../theme';
import { idUri } from '../urls';

// A different image per transition, so each tile animates its own load.
const TRANSITION_IDS: Record<Transition, number> = {
  none: 1015,
  fade: 1018,
  slide: 1025,
  scale: 1035,
  gravity: 1043,
};

// 3:2 inside a square: the four resize modes look clearly different.
const RESIZE_SOURCE: Source = { uri: idUri(1062) };

export default function TransitionsScreen() {
  const [runKey, setRunKey] = useState(0);
  const [cache, setCache] = useState<Cache>('immutable');

  const replay = useCallback(() => {
    setCache('immutable');
    setRunKey((key) => key + 1);
  }, []);

  // `reload` skips the cache for this mount only; Replay puts it back.
  const reloadFromNetwork = useCallback(() => {
    setCache('reload');
    setRunKey((key) => key + 1);
  }, []);

  const tiles = useMemo(
    () =>
      TRANSITIONS.map((transition) => ({
        transition,
        source: { uri: idUri(TRANSITION_IDS[transition]), cache } as Source,
      })),
    [cache]
  );

  return (
    <Screen>
      <Section
        title="Transitions"
        description="Each tile uses a different transition with a 600 ms duration. Replay re-mounts the tiles from cache; Reload fetches them again so the animation runs on a network load too."
      >
        <View style={shared.wrapRow}>
          <Button title="Replay" variant="primary" onPress={replay} />
          <Button title="Reload from network" onPress={reloadFromNetwork} />
        </View>
        <View style={shared.wrapRow}>
          {tiles.map(({ transition, source }) => (
            <DemoTile
              key={`${transition}-${runKey}`}
              caption={transition}
              source={source}
              transition={transition}
              transitionDuration={600}
              borderRadius={8}
              style={styles.tile}
            />
          ))}
        </View>
      </Section>

      <Section
        title="resizeMode"
        description="The same 3:2 image in a 96x96 square. The container background shows through wherever the image does not cover it."
      >
        <View style={shared.wrapRow}>
          {RESIZE_MODES.map((mode) => (
            <DemoTile
              key={mode}
              caption={mode}
              source={RESIZE_SOURCE}
              resizeMode={mode}
              style={styles.square}
            />
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 150,
    height: 100,
    backgroundColor: colors.imageBackground,
  },
  square: {
    width: 96,
    height: 96,
    backgroundColor: colors.accentSoft,
  },
});
