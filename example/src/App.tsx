import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NextImage, {
  type CacheType,
  type OnLoadEvent,
} from 'react-native-next-image';

const IMAGE_COUNT = 30;

type Row = {
  id: string;
  uri: string;
};

const rows: Row[] = Array.from({ length: IMAGE_COUNT }, (_, index) => ({
  id: String(index),
  uri: `https://picsum.photos/id/${index + 10}/600/400`,
}));

export default function App() {
  const [stats, setStats] = useState<Record<CacheType, number>>({
    memory: 0,
    disk: 0,
    network: 0,
    unknown: 0,
  });
  const [diskBytes, setDiskBytes] = useState(0);
  const [prefetched, setPrefetched] = useState(0);

  const onLoad = useCallback((event: OnLoadEvent) => {
    const { cacheType } = event.nativeEvent;
    setStats((previous) => ({
      ...previous,
      [cacheType]: (previous[cacheType] ?? 0) + 1,
    }));
  }, []);

  const refreshDiskSize = useCallback(async () => {
    setDiskBytes(await NextImage.getDiskCacheSize());
  }, []);

  const clearCaches = useCallback(async () => {
    await Promise.all([
      NextImage.clearMemoryCache(),
      NextImage.clearDiskCache(),
    ]);
    setStats({ memory: 0, disk: 0, network: 0, unknown: 0 });
    await refreshDiskSize();
  }, [refreshDiskSize]);

  const preloadRest = useCallback(async () => {
    const count = await NextImage.prefetch(
      rows.slice(10).map((row) => row.uri),
      'low'
    );
    setPrefetched(count);
  }, []);

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <Text style={styles.title}>react-native-next-image</Text>
        <Text style={styles.stats}>
          memory {stats.memory} · disk {stats.disk} · network {stats.network}
        </Text>
        <Text style={styles.stats}>
          disk cache {(diskBytes / (1024 * 1024)).toFixed(2)} MB · prefetched{' '}
          {prefetched}
        </Text>
        <View style={styles.actions}>
          <Button title="Disk size" onPress={refreshDiskSize} />
          <Button title="Prefetch" onPress={preloadRest} />
          <Button title="Clear" onPress={clearCaches} />
        </View>
        <Text style={styles.hint}>
          Scroll down, then restart the app: every image should report `disk`
          and no network request should be made.
        </Text>
      </View>
    ),
    [stats, diskBytes, prefetched, refreshDiskSize, preloadRest, clearCaches]
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <NextImage
              style={styles.image}
              source={{
                uri: item.uri,
                priority: index < 4 ? 'high' : 'normal',
                cache: 'immutable',
                cacheDuration: 60 * 24,
              }}
              resizeMode="cover"
              transition={index % 2 === 0 ? 'fade' : 'scale'}
              transitionDuration={250}
              borderRadius={12}
              prefetchThreshold={2}
              onLoad={onLoad}
            />
            <Text style={styles.caption}>#{index}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  header: {
    padding: 16,
    gap: 6,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  stats: {
    color: '#a5b4fc',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    color: '#6b7280',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  row: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#1f2937',
  },
  caption: {
    color: '#6b7280',
    paddingTop: 4,
  },
});
