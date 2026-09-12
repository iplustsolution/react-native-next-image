import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type {
  Cache,
  OnErrorEvent,
  OnLoadEvent,
  OnProgressEvent,
  Source,
} from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import EventLog from '../components/EventLog';
import Screen from '../components/Screen';
import Section from '../components/Section';
import { useEventLog } from '../hooks/useEventLog';
import { colors, formatBytes, shared, spacing } from '../theme';
import { LARGE_IMAGE_URI, largeUri } from '../urls';

const LOW_SOURCE: Source = {
  uri: largeUri(1035),
  cache: 'reload',
  priority: 'low',
};
const HIGH_SOURCE: Source = {
  uri: largeUri(1043),
  cache: 'reload',
  priority: 'high',
};

export default function ProgressScreen() {
  const { lines, log, clear } = useEventLog();
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [mode, setMode] = useState<Cache>('immutable');
  const [runKey, setRunKey] = useState(0);
  const [raceKey, setRaceKey] = useState(0);

  const source = useMemo<Source>(
    () => ({ uri: LARGE_IMAGE_URI, cache: mode }),
    [mode]
  );

  const onLoadStart = useCallback(() => {
    setProgress({ loaded: 0, total: 0 });
    log('onLoadStart');
  }, [log]);

  const onProgress = useCallback((event: OnProgressEvent) => {
    const { loaded, total } = event.nativeEvent;
    setProgress({ loaded, total });
  }, []);

  const onLoad = useCallback(
    (event: OnLoadEvent) => {
      const { cacheType, elapsed, width, height } = event.nativeEvent;
      log(`onLoad ${cacheType} ${elapsed} ms ${width}x${height}`);
    },
    [log]
  );

  const onError = useCallback(
    (event: OnErrorEvent) => {
      const { code, status } = event.nativeEvent;
      log(`onError ${code} status=${status}`);
    },
    [log]
  );

  const onLoadEnd = useCallback(() => log('onLoadEnd'), [log]);

  const load = useCallback((next: Cache) => {
    setMode(next);
    setRunKey((key) => key + 1);
  }, []);

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : 0;

  return (
    <Screen>
      <Section
        title="onProgress"
        description="A 2000x1333 photo. Progress only streams on a network load, so use reload to see it again once the photo is cached. total is 0 when the server omits Content-Length."
      >
        <View style={shared.wrapRow}>
          <Button
            title="Load again (reload)"
            variant="primary"
            onPress={() => load('reload')}
          />
          <Button
            title="Load again (cached)"
            onPress={() => load('immutable')}
          />
          <Button title="Clear log" onPress={clear} />
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.bytes}>
          {formatBytes(progress.loaded)} /{' '}
          {progress.total > 0 ? formatBytes(progress.total) : 'unknown'} (
          {percent}%)
        </Text>
        <DemoTile
          key={runKey}
          caption={`cache: '${mode}'`}
          source={source}
          onLoadStart={onLoadStart}
          onProgress={onProgress}
          onLoad={onLoad}
          onError={onError}
          onLoadEnd={onLoadEnd}
        />
        <Text style={shared.hint}>
          Expected order: onLoadStart, onProgress (several), onLoad, onLoadEnd.
        </Text>
        <EventLog lines={lines} />
      </Section>

      <Section
        title="priority: low vs high"
        description="Two photos of the same size, both with cache reload so every race is a network load. The high priority one should finish first."
      >
        <Button
          title="Race again"
          variant="primary"
          onPress={() => setRaceKey((key) => key + 1)}
        />
        <View style={shared.wrapRow}>
          <DemoTile
            key={`low-${raceKey}`}
            caption="priority: low"
            source={LOW_SOURCE}
            style={styles.raceTile}
          />
          <DemoTile
            key={`high-${raceKey}`}
            caption="priority: high"
            source={HIGH_SOURCE}
            style={styles.raceTile}
          />
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  bytes: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  raceTile: {
    width: 150,
    height: 100,
    backgroundColor: colors.imageBackground,
    marginBottom: spacing.xs,
  },
});
