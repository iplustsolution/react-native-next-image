import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  /** Newest first; the hook that produces these already caps the length. */
  lines: readonly string[];
  emptyText?: string;
};

export default function EventLog({
  lines,
  emptyText = 'No events yet.',
}: Props) {
  return (
    <View style={styles.container}>
      {lines.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        lines.map((line, index) => (
          // Lines are not unique (repeated events), so the position is the key.
          <Text key={`${index}-${line}`} style={styles.line} numberOfLines={3}>
            {line}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  line: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'monospace',
  },
  empty: {
    color: colors.textFaint,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
