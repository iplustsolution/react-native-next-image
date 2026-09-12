import { StyleSheet, Text, View } from 'react-native';
import type { CacheType } from 'react-native-next-image';
import { colors, spacing } from '../theme';

export function cacheTypeColor(cacheType: CacheType): string {
  switch (cacheType) {
    case 'memory':
      return colors.memory;
    case 'disk':
      return colors.disk;
    case 'network':
      return colors.network;
    default:
      return colors.unknown;
  }
}

type Props = {
  cacheType: CacheType;
  /** Defaults to the cache type itself. */
  text?: string;
};

export default function Badge({ cacheType, text }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: cacheTypeColor(cacheType) }]}>
      <Text style={styles.text}>{text ?? cacheType}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
