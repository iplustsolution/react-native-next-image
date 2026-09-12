import { useCallback, useState } from 'react';
import { View } from 'react-native';
import NextImage, { type Source } from 'react-native-next-image';
import Button from '../components/Button';
import DemoTile from '../components/DemoTile';
import EventLog from '../components/EventLog';
import Section from '../components/Section';
import { useEventLog } from '../hooks/useEventLog';
import { formatBytes, shared } from '../theme';
import { SIGNED_CACHE_KEY, seedUri, signedUri } from '../urls';

const API_URI = seedUri('api-demo');
const API_SOURCE: Source = { uri: API_URI };
const DISK_LIMIT_BYTES = 64 * 1024 * 1024;

export default function CacheApiSection() {
  const { lines, log, clear } = useEventLog();
  const [runKey, setRunKey] = useState(0);

  // Every API call lands in the log, including a rejection, so a broken
  // native method is visible instead of an unhandled promise.
  const call = useCallback(
    (label: string, action: () => Promise<unknown>) => {
      action()
        .then((result) => {
          log(`${label} -> ${result === undefined ? 'ok' : String(result)}`);
        })
        .catch((error: unknown) => {
          log(`${label} threw ${String(error)}`);
        });
    },
    [log]
  );

  return (
    <Section
      title="Cache API"
      description="The tile below loads a dedicated uri, so isCached should be true after it loads, false after removeFromCache, and a remount then reports network."
    >
      <DemoTile key={runKey} source={API_SOURCE} />
      <View style={shared.wrapRow}>
        <Button
          title="Remount tile"
          variant="primary"
          onPress={() => setRunKey((key) => key + 1)}
        />
        <Button
          title="isCached(uri)"
          onPress={() => call('isCached', () => NextImage.isCached(API_URI))}
        />
        <Button
          title="isCached(signed, cacheKey)"
          onPress={() =>
            call('isCached signed', () =>
              NextImage.isCached(signedUri(), SIGNED_CACHE_KEY)
            )
          }
        />
        <Button
          title="removeFromCache(uri)"
          onPress={() =>
            call('removeFromCache', () => NextImage.removeFromCache(API_URI))
          }
        />
        <Button
          title="getDiskCacheSize"
          onPress={() =>
            call('getDiskCacheSize', async () =>
              formatBytes(await NextImage.getDiskCacheSize())
            )
          }
        />
        <Button
          title="getMemoryCacheSize"
          onPress={() =>
            call('getMemoryCacheSize', async () =>
              formatBytes(await NextImage.getMemoryCacheSize())
            )
          }
        />
        <Button
          title="setCacheLimits(disk 64 MB)"
          onPress={() =>
            call('setCacheLimits', () =>
              NextImage.setCacheLimits({ diskBytes: DISK_LIMIT_BYTES })
            )
          }
        />
        <Button
          title="clearMemoryCache"
          onPress={() => call('clearMemoryCache', NextImage.clearMemoryCache)}
        />
        <Button
          title="clearDiskCache"
          onPress={() => call('clearDiskCache', NextImage.clearDiskCache)}
        />
        <Button title="Clear log" onPress={clear} />
      </View>
      <EventLog lines={lines} />
    </Section>
  );
}
