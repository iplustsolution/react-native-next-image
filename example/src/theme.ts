import { StyleSheet } from 'react-native';

export const colors = {
  background: '#0b0b0f',
  surface: '#15161c',
  surfaceRaised: '#1f2937',
  border: '#262833',
  text: '#f3f4f6',
  textMuted: '#9ca3af',
  textFaint: '#6b7280',
  accent: '#6366f1',
  accentSoft: '#312e81',
  onAccent: '#ffffff',
  danger: '#f43f5e',
  warning: '#f59e0b',
  // Cache origins, used by Badge and by the gallery counters.
  memory: '#22c55e',
  disk: '#3b82f6',
  network: '#f97316',
  unknown: '#6b7280',
  // Behind every image so a rounded container is visible against it.
  imageBackground: '#1f2937',
  progressTrack: '#262833',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
} as const;

export const shared = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  mono: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  image: {
    width: '100%',
    height: 160,
    backgroundColor: colors.imageBackground,
  },
});

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
