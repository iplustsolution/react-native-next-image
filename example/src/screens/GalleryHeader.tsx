import { StyleSheet, Text, View } from 'react-native';
import type { CacheType } from 'react-native-next-image';
import Button from '../components/Button';
import Stat from '../components/Stat';
import { colors, formatBytes, shared, spacing } from '../theme';

export type Counters = Record<CacheType, number>;

type Props = {
  counters: Counters;
  diskBytes: number;
  memoryBytes: number;
  status: string;
  onPrefetchRest: () => void;
  onPreload: () => void;
  onRefreshSizes: () => void;
  onClearMemory: () => void;
  onClearDisk: () => void;
  onRemount: () => void;
};

export default function GalleryHeader({
  counters,
  diskBytes,
  memoryBytes,
  status,
  onPrefetchRest,
  onPreload,
  onRefreshSizes,
  onClearMemory,
  onClearDisk,
  onRemount,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={shared.wrapRow}>
        <Stat label="memory" value={counters.memory} color={colors.memory} />
        <Stat label="disk" value={counters.disk} color={colors.disk} />
        <Stat label="network" value={counters.network} color={colors.network} />
        <Stat label="unknown" value={counters.unknown} color={colors.unknown} />
      </View>
      <View style={shared.wrapRow}>
        <Stat label="disk cache" value={formatBytes(diskBytes)} />
        <Stat label="memory cache" value={formatBytes(memoryBytes)} />
      </View>
      <View style={shared.wrapRow}>
        <Button
          title="Prefetch rest"
          variant="primary"
          onPress={onPrefetchRest}
        />
        <Button title="Preload" onPress={onPreload} />
        <Button title="Refresh sizes" onPress={onRefreshSizes} />
        <Button title="Clear memory" onPress={onClearMemory} />
        <Button title="Clear disk" onPress={onClearDisk} />
        <Button title="Remount list" onPress={onRemount} />
      </View>
      {status.length > 0 ? <Text style={styles.status}>{status}</Text> : null}
      <Text style={shared.hint}>
        Scroll, then restart the app: rows should report disk, not network.
        Remount the list without restarting and rows should report memory.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  status: {
    color: colors.accent,
    fontSize: 12,
  },
});
