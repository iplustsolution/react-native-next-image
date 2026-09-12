import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, shared, spacing } from '../theme';

type Props = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export default function Section({ title, description, children }: Props) {
  return (
    <View style={shared.card}>
      <Text style={styles.title}>{title}</Text>
      {description != null ? (
        <Text style={shared.body}>{description}</Text>
      ) : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
});
