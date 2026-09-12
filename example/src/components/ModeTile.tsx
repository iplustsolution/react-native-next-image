import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Cache, NextImageProps, Source } from 'react-native-next-image';
import { shared, spacing } from '../theme';
import Button from './Button';
import DemoTile from './DemoTile';

type Props = Omit<NextImageProps, 'source'> & {
  uri: string;
  /** One button per mode; pressing one re-mounts the tile with that `cache`. */
  modes: readonly Cache[];
  /** Merged into the source, for headers, priority, cacheKey and so on. */
  sourceExtras?: Omit<Source, 'uri' | 'cache'>;
  caption?: string;
};

export default function ModeTile({
  uri,
  modes,
  sourceExtras,
  caption,
  ...imageProps
}: Props) {
  const [mode, setMode] = useState<Cache>(modes[0] ?? 'immutable');
  const [runKey, setRunKey] = useState(0);

  const source = useMemo<Source>(
    () => ({ ...sourceExtras, uri, cache: mode }),
    [sourceExtras, uri, mode]
  );

  const load = useCallback((next: Cache) => {
    setMode(next);
    setRunKey((key) => key + 1);
  }, []);

  return (
    <View style={styles.container}>
      <View style={shared.wrapRow}>
        {modes.map((candidate) => (
          <Button
            key={candidate}
            title={`Load: ${candidate}`}
            variant={candidate === mode ? 'primary' : 'secondary'}
            onPress={() => load(candidate)}
          />
        ))}
      </View>
      <DemoTile
        key={runKey}
        caption={caption ?? `cache: '${mode}'`}
        source={source}
        {...imageProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
});
