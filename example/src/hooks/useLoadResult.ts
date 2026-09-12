import { useCallback, useState } from 'react';
import type {
  CacheType,
  OnErrorEvent,
  OnLoadEvent,
} from 'react-native-next-image';

export type LoadOutcome =
  | { kind: 'idle' }
  | { kind: 'loading'; starts: number }
  | {
      kind: 'loaded';
      cacheType: CacheType;
      elapsed: number;
      width: number;
      height: number;
    }
  | {
      kind: 'error';
      code: string;
      status: number;
      retryable: boolean;
      message: string;
    };

/**
 * Tracks one image's lifecycle so every demo can show where the bytes came
 * from. `starts` counts onLoadStart calls; more than one means the view was
 * asked to load again (a prop change), since native retries stay silent.
 */
export function useLoadResult() {
  const [outcome, setOutcome] = useState<LoadOutcome>({ kind: 'idle' });

  const onLoadStart = useCallback(() => {
    setOutcome((previous) => ({
      kind: 'loading',
      starts: previous.kind === 'loading' ? previous.starts + 1 : 1,
    }));
  }, []);

  const onLoad = useCallback((event: OnLoadEvent) => {
    const { cacheType, elapsed, width, height } = event.nativeEvent;
    setOutcome({ kind: 'loaded', cacheType, elapsed, width, height });
  }, []);

  const onError = useCallback((event: OnErrorEvent) => {
    const { code, status, retryable, error } = event.nativeEvent;
    setOutcome({ kind: 'error', code, status, retryable, message: error });
  }, []);

  const reset = useCallback(() => setOutcome({ kind: 'idle' }), []);

  return { outcome, onLoadStart, onLoad, onError, reset };
}
