import { useEffect, useState, type ComponentType } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NextImage, { isNativeViewAvailable } from 'react-native-next-image';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import CacheScreen from './screens/CacheScreen';
import EffectsScreen from './screens/EffectsScreen';
import ErrorsScreen from './screens/ErrorsScreen';
import GalleryScreen from './screens/GalleryScreen';
import HeadersScreen from './screens/HeadersScreen';
import LocalScreen from './screens/LocalScreen';
import ProgressScreen from './screens/ProgressScreen';
import TransitionsScreen from './screens/TransitionsScreen';
import { colors, spacing } from './theme';

// Once per app start, before any image mounts. data: uris are off by default;
// the Local screen needs them. Everything else keeps the secure defaults.
NextImage.configure({
  allowDataUri: true,
  diskCacheBytes: 100 * 1024 * 1024,
  requestTimeoutMs: 20000,
});

type TabKey =
  | 'gallery'
  | 'transitions'
  | 'effects'
  | 'cache'
  | 'errors'
  | 'local'
  | 'progress'
  | 'headers';

const TABS: readonly { key: TabKey; title: string }[] = [
  { key: 'gallery', title: 'Gallery' },
  { key: 'transitions', title: 'Transitions' },
  { key: 'effects', title: 'Effects' },
  { key: 'cache', title: 'Cache' },
  { key: 'errors', title: 'Errors' },
  { key: 'local', title: 'Local' },
  { key: 'progress', title: 'Progress' },
  { key: 'headers', title: 'Headers' },
];

const SCREENS: Record<TabKey, ComponentType> = {
  gallery: GalleryScreen,
  transitions: TransitionsScreen,
  effects: EffectsScreen,
  cache: CacheScreen,
  errors: ErrorsScreen,
  local: LocalScreen,
  progress: ProgressScreen,
  headers: HeadersScreen,
};

/** `nextimage://tab/cache` opens a tab directly, which keeps device testing scriptable. */
function tabFromUrl(url: string | null): TabKey | null {
  const match = url == null ? null : /tab\/([a-z]+)/.exec(url);
  const key = match?.[1];
  return key != null && key in SCREENS ? (key as TabKey) : null;
}

type AppProps = {
  /** Set by the native hosts from `NEXTIMAGE_TAB`, so a device test can start on a tab. */
  initialTab?: string;
};

export default function App({ initialTab }: AppProps) {
  const [tab, setTab] = useState<TabKey>(
    () =>
      tabFromUrl(initialTab == null ? null : `tab/${initialTab}`) ?? 'gallery'
  );
  const Active = SCREENS[tab];

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => {
        const initial = tabFromUrl(url ?? null);
        if (initial != null) {
          setTab(initial);
        }
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const next = tabFromUrl(url);
      if (next != null) {
        setTab(next);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
        />
        <View style={styles.header}>
          <Text style={styles.title}>react-native-next-image</Text>
          <Text style={styles.subtitle}>
            {isNativeViewAvailable
              ? 'native view linked'
              : 'fallback: platform Image, cache APIs are no-ops'}
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabStrip}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map(({ key, title }) => {
            const selected = key === tab;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setTab(key)}
                style={[styles.tab, selected && styles.tabSelected]}
              >
                <Text
                  style={[styles.tabLabel, selected && styles.tabLabelSelected]}
                >
                  {title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.body}>
          {/* Keyed so switching tabs unmounts the previous screen's state. */}
          <Active key={tab} />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textFaint,
    fontSize: 12,
  },
  tabStrip: {
    flexGrow: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tabs: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  tabSelected: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabLabelSelected: {
    color: colors.onAccent,
  },
  body: {
    flex: 1,
  },
});
