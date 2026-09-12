import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import NextImage, {
  type NextImageProps,
  type OnErrorEvent,
  type OnLoadEvent,
} from 'react-native-next-image';
import { useLoadResult } from '../hooks/useLoadResult';
import { shared, spacing } from '../theme';
import LoadResult from './LoadResult';

type Props = NextImageProps & {
  caption?: string;
};

/**
 * A NextImage plus its own load summary. Handlers passed in still fire, so a
 * screen can keep counters while the tile keeps the badge. Re-mount it with a
 * `key` to run a load again.
 */
export default function DemoTile({
  caption,
  style,
  onLoadStart,
  onLoad,
  onError,
  ...imageProps
}: Props) {
  const {
    outcome,
    onLoadStart: trackStart,
    onLoad: trackLoad,
    onError: trackError,
  } = useLoadResult();

  const handleLoadStart = useCallback(() => {
    trackStart();
    onLoadStart?.();
  }, [trackStart, onLoadStart]);

  const handleLoad = useCallback(
    (event: OnLoadEvent) => {
      trackLoad(event);
      onLoad?.(event);
    },
    [trackLoad, onLoad]
  );

  const handleError = useCallback(
    (event: OnErrorEvent) => {
      trackError(event);
      onError?.(event);
    },
    [trackError, onError]
  );

  return (
    <View style={styles.container}>
      {caption != null ? <Text style={shared.body}>{caption}</Text> : null}
      <NextImage
        {...imageProps}
        style={[shared.image, style]}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
      />
      <LoadResult outcome={outcome} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
});
