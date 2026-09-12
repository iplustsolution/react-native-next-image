import { StyleSheet, Text, View } from 'react-native';
import type { LoadOutcome } from '../hooks/useLoadResult';
import { colors, shared } from '../theme';
import Badge from './Badge';

type Props = {
  outcome: LoadOutcome;
};

/** One line summarising where an image came from, or why it failed. */
export default function LoadResult({ outcome }: Props) {
  switch (outcome.kind) {
    case 'idle':
      return <Text style={shared.hint}>waiting</Text>;
    case 'loading':
      return (
        <Text style={shared.hint}>
          loading{outcome.starts > 1 ? ` (start #${outcome.starts})` : ''}
        </Text>
      );
    case 'loaded':
      return (
        <View style={shared.row}>
          <Badge cacheType={outcome.cacheType} />
          <Text style={styles.meta}>
            {outcome.elapsed} ms · {outcome.width}x{outcome.height}
          </Text>
        </View>
      );
    case 'error':
      return (
        <Text style={styles.error} numberOfLines={3}>
          {outcome.code}
          {outcome.status > 0 ? ` (${outcome.status})` : ''} ·{' '}
          {outcome.retryable ? 'retryable' : 'final'} · {outcome.message}
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
  },
});
