import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import NextImage, {
  type CacheType,
  type OnLoadEvent,
  type Source,
} from 'react-native-next-image';
import LoadResult from '../components/LoadResult';
import { useLoadResult } from '../hooks/useLoadResult';
import { colors, shared, spacing } from '../theme';
import { GALLERY_URIS } from '../urls';
import GalleryHeader, { type Counters } from './GalleryHeader';

const EMPTY_COUNTERS: Counters = { memory: 0, disk: 0, network: 0, unknown: 0 };
const EAGER_ROWS = 10;

type RowProps = {
  uri: string;
  index: number;
  onCounted: (cacheType: CacheType) => void;
};

const GalleryRow = memo(function GalleryRowInner({
  uri,
  index,
  onCounted,
}: RowProps) {
  const { outcome, onLoadStart, onLoad, onError } = useLoadResult();
  // Memoised so the row's source identity only changes with its data.
  const source = useMemo<Source>(
    () => ({ uri, priority: index < 4 ? 'high' : 'normal' }),
    [uri, index]
  );
  const handleLoad = useCallback(
    (event: OnLoadEvent) => {
      onLoad(event);
      onCounted(event.nativeEvent.cacheType);
    },
    [onLoad, onCounted]
  );

  return (
    <View style={styles.row}>
      <NextImage
        style={styles.image}
        source={source}
        resizeMode="cover"
        transition="fade"
        transitionDuration={250}
        borderRadius={12}
        prefetchThreshold={2}
        onLoadStart={onLoadStart}
        onLoad={handleLoad}
        onError={onError}
      />
      <View style={shared.row}>
        <Text style={styles.index}>#{index}</Text>
        <LoadResult outcome={outcome} />
      </View>
    </View>
  );
});

export default function GalleryScreen() {
  const [counters, setCounters] = useState<Counters>(EMPTY_COUNTERS);
  const [diskBytes, setDiskBytes] = useState(0);
  const [memoryBytes, setMemoryBytes] = useState(0);
  const [status, setStatus] = useState('');
  const [listKey, setListKey] = useState(0);

  const onCounted = useCallback((cacheType: CacheType) => {
    setCounters((previous) => ({
      ...previous,
      [cacheType]: previous[cacheType] + 1,
    }));
  }, []);

  const refreshSizes = useCallback(async () => {
    const [disk, memory] = await Promise.all([
      NextImage.getDiskCacheSize(),
      NextImage.getMemoryCacheSize(),
    ]);
    setDiskBytes(disk);
    setMemoryBytes(memory);
  }, []);

  // Demo actions must never throw into a Pressable, so each one reports
  // failures through the status line instead.
  const run = useCallback(
    (label: string, action: () => Promise<string | void>) => {
      action()
        .then((message) => {
          setStatus(message ?? label);
          return refreshSizes();
        })
        .catch((error: unknown) => {
          setStatus(`${label} failed: ${String(error)}`);
        });
    },
    [refreshSizes]
  );

  useEffect(() => {
    run('sizes refreshed', refreshSizes);
  }, [run, refreshSizes]);

  const prefetchRest = useCallback(() => {
    const rest = GALLERY_URIS.slice(EAGER_ROWS);
    run('prefetch', async () => {
      const cached = await NextImage.prefetch(rest, 'low');
      return `prefetch finished: ${cached} of ${rest.length} now cached`;
    });
  }, [run]);

  const preload = useCallback(() => {
    run('preload', async () => {
      NextImage.preload(
        GALLERY_URIS.slice(0, EAGER_ROWS).map((uri): Source => ({
          uri,
          priority: 'low',
        }))
      );
      return `preload sent for ${EAGER_ROWS} sources`;
    });
  }, [run]);

  const refresh = useCallback(() => {
    run('sizes refreshed', refreshSizes);
  }, [run, refreshSizes]);

  const clearMemory = useCallback(() => {
    run('memory cache cleared', NextImage.clearMemoryCache);
  }, [run]);

  const clearDisk = useCallback(() => {
    run('disk cache cleared', NextImage.clearDiskCache);
  }, [run]);

  const remount = useCallback(() => {
    setCounters(EMPTY_COUNTERS);
    setStatus('list remounted');
    setListKey((key) => key + 1);
  }, []);

  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item, index }) => (
      <GalleryRow uri={item} index={index} onCounted={onCounted} />
    ),
    [onCounted]
  );

  const header = useMemo(
    () => (
      <GalleryHeader
        counters={counters}
        diskBytes={diskBytes}
        memoryBytes={memoryBytes}
        status={status}
        onPrefetchRest={prefetchRest}
        onPreload={preload}
        onRefreshSizes={refresh}
        onClearMemory={clearMemory}
        onClearDisk={clearDisk}
        onRemount={remount}
      />
    ),
    [
      counters,
      diskBytes,
      memoryBytes,
      status,
      prefetchRest,
      preload,
      refresh,
      clearMemory,
      clearDisk,
      remount,
    ]
  );

  return (
    <FlatList
      // A new key re-mounts every row, so cache hits become visible.
      key={listKey}
      data={GALLERY_URIS}
      keyExtractor={(uri) => uri}
      renderItem={renderItem}
      ListHeaderComponent={header}
      style={styles.list}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  row: {
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: colors.imageBackground,
  },
  index: {
    color: colors.textFaint,
    fontSize: 12,
    minWidth: 32,
  },
});
