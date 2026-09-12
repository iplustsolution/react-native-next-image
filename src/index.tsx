import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as ReactNative from 'react-native';
import { Image, NativeModules, StyleSheet, View } from 'react-native';
import type {
  AccessibilityProps,
  ColorValue,
  HostInstance,
  ImageRequireSource,
  ImageStyle as RNImageStyle,
  LayoutChangeEvent,
  StyleProp,
  ViewProps,
  ViewStyle,
} from 'react-native';

import {
  CACHE_CONTROLS,
  MAX_BLUR_RADIUS,
  MAX_RETRY_COUNT,
  MAX_RETRY_DELAY_MS,
  MAX_TRANSITION_DURATION_MS,
  PRIORITIES,
  RESIZE_MODES,
  TRANSITIONS,
  clampFloat,
  clampInt,
  describeRejection,
  normalizeEnum,
  resolveSource,
  type NativeSource,
  type Priority,
  type ResizeMode,
  type Source,
  type Transition,
} from './props';
import {
  configureSecurity,
  getSecurityConfig,
  validateCertificatePins,
  type SecurityConfig,
  type SecurityErrorCode,
} from './security';
import { observeViewport, type ViewportSubscription } from './viewport';

export type { Cache, Priority, ResizeMode, Source, Transition } from './props';
export type { SecurityConfig, SecurityErrorCode } from './security';
export { redactHeaders, redactUri } from './security';
export { isNearViewport, setViewportPollInterval } from './viewport';

const isFabricEnabled =
  (global as Record<string, unknown>)?.nativeFabricUIManager != null;
const isTurboModuleEnabled =
  (global as Record<string, unknown>)?.__turboModuleProxy != null ||
  isFabricEnabled;

type NativeModuleShape = {
  preload?: (sources: NativeSource[]) => void;
  prefetch?: (uris: string[], priority: string) => Promise<number>;
  clearMemoryCache?: () => Promise<void>;
  clearDiskCache?: () => Promise<void>;
  isCached?: (uri: string, cacheKey: string) => Promise<boolean>;
  removeFromCache?: (uri: string, cacheKey: string) => Promise<boolean>;
  getDiskCacheSize?: () => Promise<number>;
  getMemoryCacheSize?: () => Promise<number>;
  setCacheLimits?: (memoryBytes: number, diskBytes: number) => Promise<void>;
  configure?: (options: object) => void;
};

function resolveNativeModule(): NativeModuleShape | null {
  try {
    if (isTurboModuleEnabled) {
      return require('./NativeNextImageModule').default as NativeModuleShape;
    }
    return (NativeModules.NextImageModule as NativeModuleShape) ?? null;
  } catch {
    return null;
  }
}

function resolveNativeView(): React.ComponentType<
  Record<string, unknown>
> | null {
  try {
    if (isFabricEnabled) {
      return require('./NextImageNativeComponent')
        .default as React.ComponentType<Record<string, unknown>>;
    }
    // Looked up dynamically: react-native-web has no `requireNativeComponent`,
    // and a static import of it would break the web bundle.
    const { requireNativeComponent } = ReactNative as {
      requireNativeComponent?: (
        name: string
      ) => React.ComponentType<Record<string, unknown>>;
    };
    return requireNativeComponent?.('NextImageView') ?? null;
  } catch {
    return null;
  }
}

const NextImageModule = resolveNativeModule();
const NextImageView = resolveNativeView();

const resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
} as const;

const priority = {
  low: 'low',
  normal: 'normal',
  high: 'high',
} as const;

const transition = {
  fade: 'fade',
  none: 'none',
  slide: 'slide',
  scale: 'scale',
  gravity: 'gravity',
} as const;

const cacheControl = {
  immutable: 'immutable',
  web: 'web',
  cacheOnly: 'cacheOnly',
  reload: 'reload',
} as const;

export type CacheType = 'memory' | 'disk' | 'network' | 'unknown';

export interface OnLoadEvent {
  nativeEvent: {
    width: number;
    height: number;
    /** Where the bytes came from. `memory` and `disk` mean no network request. */
    cacheType: CacheType;
    /** Milliseconds from request start to display. */
    elapsed: number;
  };
}

export interface OnProgressEvent {
  nativeEvent: {
    loaded: number;
    total: number;
  };
}

export interface OnErrorEvent {
  nativeEvent: {
    error: string;
    /** `NETWORK`, `DECODE`, `CACHE_MISS`, `BLOCKED`, `UNKNOWN`, or a security code. */
    code: string;
    /** HTTP status when the failure came from a response, otherwise 0. */
    status: number;
    retryable: boolean;
  };
}

export type ImageStyle = RNImageStyle &
  ViewStyle & {
    overlayColor?: string;
  };

export interface NextImageProps extends AccessibilityProps, ViewProps {
  source?: Source | ImageRequireSource;
  /** Shown when `source` fails. A bundled asset or an absolute URL. */
  defaultSource?: ImageRequireSource | string;
  /** Shown while `source` loads. A bundled asset or an absolute URL. */
  placeholder?: ImageRequireSource | string;
  resizeMode?: ResizeMode;
  transition?: Transition;
  transitionDuration?: number;
  borderRadius?: number;
  isCircle?: boolean;
  downsample?: boolean;
  grayscale?: boolean;
  blurRadius?: number;
  tintColor?: ColorValue;
  /**
   * How far outside the viewport an image may be and still start downloading,
   * as a multiple of the screen size. `4` is 400% of the screen in every
   * direction; `0` waits until the image is actually visible; `Infinity`
   * disables the check.
   *
   * Cached images ignore this entirely and render immediately.
   */
  prefetchThreshold?: number;
  /** Attempts after the first failure. Defaults to 2, maximum 10. */
  retryCount?: number;
  /** Delay before the first retry in ms, doubling per attempt. Defaults to 1000. */
  retryDelay?: number;
  onLoadStart?(): void;
  onProgress?(event: OnProgressEvent): void;
  onLoad?(event: OnLoadEvent): void;
  onError?(event: OnErrorEvent): void;
  onLoadEnd?(): void;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ImageStyle>;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * Bundled assets and Metro's dev server URLs are trusted by construction, so
 * they skip the URL policy that applies to remote sources.
 */
function resolveLocalUri(
  value: ImageRequireSource | string | undefined
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    const resolved = Image.resolveAssetSource(value);
    return resolved?.uri ?? null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return null;
}

type PreparedSource =
  | { kind: 'empty' }
  | { kind: 'ok'; source: NativeSource }
  | { kind: 'invalid'; code: SecurityErrorCode; message: string };

function prepareSource(
  source: Source | ImageRequireSource | undefined
): PreparedSource {
  if (typeof source === 'number') {
    const uri = resolveLocalUri(source);
    if (uri == null) {
      return { kind: 'empty' };
    }
    return {
      kind: 'ok',
      source: {
        uri,
        headers: [],
        priority: 'normal',
        cache: 'immutable',
        cacheDuration: 0,
        cacheKey: '',
      },
    };
  }

  const resolution = resolveSource(source as Source | undefined);
  if (resolution.kind === 'ok') {
    if (__DEV__ && resolution.rejectedHeaders.length > 0) {
      for (const rejection of resolution.rejectedHeaders) {
        console.warn(
          `NextImage: dropped header "${rejection.name}": ${rejection.message}`
        );
      }
    }
    return { kind: 'ok', source: resolution.source };
  }
  if (resolution.kind === 'invalid') {
    // The uri is redacted before it reaches a log or an onError payload, which
    // is what the Kotlin and Swift layers do with their own rejections.
    return {
      kind: 'invalid',
      code: resolution.code,
      message: describeRejection(
        (source as Source | undefined)?.uri ?? '',
        resolution.message
      ),
    };
  }
  return { kind: 'empty' };
}

function NextImageBase({
  source,
  defaultSource,
  placeholder,
  tintColor,
  blurRadius,
  onLoadStart,
  onProgress,
  onLoad,
  onError,
  onLoadEnd,
  onLayout,
  style,
  children,
  transition: transitionProp,
  transitionDuration,
  borderRadius,
  isCircle,
  downsample,
  grayscale,
  prefetchThreshold = 4,
  retryCount,
  retryDelay,
  resizeMode: resizeModeProp,
  forwardedRef,
  ...rest
}: NextImageProps & { forwardedRef: React.Ref<HostInstance> }) {
  // Keyed on the serialised source, because `source={{ uri }}` is a new object
  // on every render and re-validating it would re-fire onError each time.
  const sourceKey = useMemo(
    () =>
      typeof source === 'number'
        ? `asset:${source}`
        : JSON.stringify(source ?? null),
    [source]
  );
  const prepared = useMemo(
    () => prepareSource(source),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey]
  );
  const nativeSource = prepared.kind === 'ok' ? prepared.source : null;

  const gated = Number.isFinite(prefetchThreshold) && prefetchThreshold >= 0;
  const [nearViewport, setNearViewport] = useState(!gated);
  // Derived rather than stored, so raising the threshold to Infinity releases
  // an image that is still waiting to be measured.
  const deferNetwork = gated && !nearViewport;
  const containerRef = useRef<HostInstance | null>(null);
  const subscriptionRef = useRef<ViewportSubscription | null>(null);

  // One shared tracker measures every pending image; the subscription ends as
  // soon as this image enters its window, so nothing keeps polling.
  useEffect(() => {
    if (!gated || nearViewport) {
      return undefined;
    }
    const subscription = observeViewport(
      () => containerRef.current,
      prefetchThreshold,
      () => setNearViewport(true)
    );
    subscriptionRef.current = subscription;
    return () => {
      subscription.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [gated, nearViewport, prefetchThreshold]);

  // Callbacks are read through a ref so that inline arrow handlers do not
  // count as a change to the source.
  const callbacksRef = useRef({ onError, onLoadEnd });
  callbacksRef.current = { onError, onLoadEnd };

  // A blocked source never reaches native, so it is reported from here. This
  // fires once per distinct rejected source, not once per render.
  const rejection = prepared.kind === 'invalid' ? prepared : null;
  const rejectionCode = rejection?.code ?? null;
  const rejectionMessage = rejection?.message ?? null;

  useEffect(() => {
    if (rejectionCode == null || rejectionMessage == null) {
      return;
    }
    if (__DEV__) {
      console.warn(`NextImage: ${rejectionMessage}`);
    }
    callbacksRef.current.onError?.({
      nativeEvent: {
        error: rejectionMessage,
        code: rejectionCode,
        status: 0,
        retryable: false,
      },
    });
    callbacksRef.current.onLoadEnd?.();
  }, [rejectionCode, rejectionMessage]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      subscriptionRef.current?.measureNow();
      onLayout?.(event);
    },
    [onLayout]
  );

  const setRef = useCallback(
    (node: HostInstance | null) => {
      containerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef != null) {
        (forwardedRef as React.RefObject<HostInstance | null>).current = node;
      }
    },
    [forwardedRef]
  );

  const nativeProps = useMemo(
    () => ({
      resizeMode: normalizeEnum(resizeModeProp, RESIZE_MODES, 'cover'),
      transition: normalizeEnum(transitionProp, TRANSITIONS, 'none'),
      transitionDuration: clampInt(
        transitionDuration,
        0,
        MAX_TRANSITION_DURATION_MS,
        300
      ),
      borderRadius: clampFloat(borderRadius, 0, Number.MAX_SAFE_INTEGER, 0),
      blurRadius: clampInt(blurRadius, 0, MAX_BLUR_RADIUS, 0),
      isCircle: isCircle === true,
      downsample: downsample !== false,
      grayscale: grayscale === true,
      retryCount: clampInt(retryCount, 0, MAX_RETRY_COUNT, 2),
      retryDelay: clampInt(retryDelay, 0, MAX_RETRY_DELAY_MS, 1000),
    }),
    [
      resizeModeProp,
      transitionProp,
      transitionDuration,
      borderRadius,
      blurRadius,
      isCircle,
      downsample,
      grayscale,
      retryCount,
      retryDelay,
    ]
  );

  const resolvedDefaultSource = useMemo(
    () => resolveLocalUri(defaultSource),
    [defaultSource]
  );
  const resolvedPlaceholder = useMemo(
    () => resolveLocalUri(placeholder),
    [placeholder]
  );

  // Without a native view (web, or a missing autolink) fall back to the
  // platform image so the tree still renders.
  const NativeView = NextImageView;

  return (
    <View
      {...rest}
      style={[styles.container, style]}
      ref={setRef}
      onLayout={handleLayout}
    >
      {nativeSource != null && NativeView != null ? (
        <NativeView
          style={StyleSheet.absoluteFill}
          source={nativeSource}
          defaultSource={resolvedDefaultSource}
          placeholder={resolvedPlaceholder}
          tintColor={tintColor}
          deferNetwork={deferNetwork}
          onNextImageLoadStart={onLoadStart}
          onNextImageProgress={onProgress}
          onNextImageLoad={onLoad}
          onNextImageError={onError}
          onNextImageLoadEnd={onLoadEnd}
          {...nativeProps}
        />
      ) : null}
      {nativeSource != null && NativeView == null ? (
        <Image
          style={StyleSheet.absoluteFill}
          source={{ uri: nativeSource.uri }}
          resizeMode={nativeProps.resizeMode}
          blurRadius={nativeProps.blurRadius}
          onLoadStart={onLoadStart}
          onLoad={(event) =>
            onLoad?.({
              nativeEvent: {
                width: event.nativeEvent?.source?.width ?? 0,
                height: event.nativeEvent?.source?.height ?? 0,
                cacheType: 'unknown',
                elapsed: 0,
              },
            })
          }
          onError={(event) =>
            onError?.({
              nativeEvent: {
                error: event.nativeEvent?.error ?? 'Image failed to load',
                code: 'UNKNOWN',
                status: 0,
                retryable: true,
              },
            })
          }
          onLoadEnd={onLoadEnd}
        />
      ) : null}
      {children}
    </View>
  );
}

const NextImageMemo = memo(NextImageBase);

const NextImageComponent = forwardRef<HostInstance, NextImageProps>(
  (props, ref) => <NextImageMemo forwardedRef={ref} {...props} />
);

NextImageComponent.displayName = 'NextImage';

export type NextImageConfig = Partial<SecurityConfig> & {
  /** In-memory cache budget in bytes. Defaults to 25% of the app's heap. */
  memoryCacheBytes?: number;
  /** On-disk cache budget in bytes. Defaults to 250MB. */
  diskCacheBytes?: number;
  /** Connect and read timeout for image requests, in milliseconds. */
  requestTimeoutMs?: number;
  /**
   * When false (the default) NextImage ignores server cache headers and keeps
   * an image for `cacheDuration`. Set true to obey `Cache-Control` instead.
   */
  respectServerCacheHeaders?: boolean;
};

const SECURITY_KEYS: readonly (keyof SecurityConfig)[] = [
  'allowInsecureHttp',
  'allowDataUri',
  'allowFileUri',
  'allowedHosts',
  'blockedHosts',
  'blockPrivateNetworks',
  'allowUriCredentials',
  'maxUriLength',
  'maxDataUriBytes',
  'maxHeaderCount',
  'maxHeaderNameLength',
  'maxHeaderValueLength',
  'certificatePins',
];

export interface NextImageStaticProperties {
  resizeMode: typeof resizeMode;
  priority: typeof priority;
  cacheControl: typeof cacheControl;
  transition: typeof transition;
  /** Apply security and cache settings to both the JS and native layers. */
  configure(config: NextImageConfig): void;
  getConfig(): SecurityConfig;
  /** Warm the cache. Invalid or blocked sources are skipped. */
  preload(sources: Source[]): void;
  /** Warm the cache and resolve with the number of accepted URIs. */
  prefetch(uris: string[], requestPriority?: Priority): Promise<number>;
  clearMemoryCache(): Promise<void>;
  clearDiskCache(): Promise<void>;
  /** True when the image would render without a network request. */
  isCached(uri: string, cacheKey?: string): Promise<boolean>;
  removeFromCache(uri: string, cacheKey?: string): Promise<boolean>;
  getDiskCacheSize(): Promise<number>;
  getMemoryCacheSize(): Promise<number>;
  setCacheLimits(limits: {
    memoryBytes?: number;
    diskBytes?: number;
  }): Promise<void>;
}

const NextImage = NextImageComponent as React.ForwardRefExoticComponent<
  NextImageProps & React.RefAttributes<HostInstance>
> &
  NextImageStaticProperties;

NextImage.resizeMode = resizeMode;
NextImage.priority = priority;
NextImage.cacheControl = cacheControl;
NextImage.transition = transition;

NextImage.configure = (config: NextImageConfig) => {
  if (config.certificatePins != null) {
    validateCertificatePins(config.certificatePins);
  }

  const securityPatch: Partial<SecurityConfig> = {};
  for (const key of SECURITY_KEYS) {
    if (config[key] !== undefined) {
      // Each key is assigned to its own slot, so the widened value is sound.
      (securityPatch as Record<string, unknown>)[key] = config[key];
    }
  }
  if (Object.keys(securityPatch).length > 0) {
    configureSecurity(securityPatch);
  }

  NextImageModule?.configure?.({
    ...securityPatch,
    ...(config.memoryCacheBytes !== undefined
      ? { memoryCacheBytes: config.memoryCacheBytes }
      : null),
    ...(config.diskCacheBytes !== undefined
      ? { diskCacheBytes: config.diskCacheBytes }
      : null),
    ...(config.requestTimeoutMs !== undefined
      ? { requestTimeoutMs: config.requestTimeoutMs }
      : null),
    ...(config.respectServerCacheHeaders !== undefined
      ? { respectServerCacheHeaders: config.respectServerCacheHeaders }
      : null),
  });
};

NextImage.getConfig = () => getSecurityConfig();

NextImage.preload = (sources: Source[]) => {
  if (!Array.isArray(sources) || NextImageModule?.preload == null) {
    return;
  }
  const prepared: NativeSource[] = [];
  for (const candidate of sources) {
    const resolution = resolveSource(candidate);
    if (resolution.kind === 'ok') {
      prepared.push(resolution.source);
    } else if (resolution.kind === 'invalid' && __DEV__) {
      console.warn(
        `NextImage.preload: ${describeRejection(
          candidate?.uri ?? '',
          resolution.message
        )}`
      );
    }
  }
  if (prepared.length > 0) {
    NextImageModule.preload(prepared);
  }
};

NextImage.prefetch = (uris: string[], requestPriority: Priority = 'normal') => {
  if (!Array.isArray(uris) || NextImageModule?.prefetch == null) {
    return Promise.resolve(0);
  }
  const accepted = uris.filter((uri) => resolveSource({ uri }).kind === 'ok');
  if (accepted.length === 0) {
    return Promise.resolve(0);
  }
  return NextImageModule.prefetch(
    accepted,
    normalizeEnum(requestPriority, PRIORITIES, 'normal')
  );
};

NextImage.clearMemoryCache = () =>
  NextImageModule?.clearMemoryCache?.() ?? Promise.resolve();

NextImage.clearDiskCache = () =>
  NextImageModule?.clearDiskCache?.() ?? Promise.resolve();

NextImage.isCached = (uri: string, cacheKey = '') =>
  NextImageModule?.isCached?.(uri, cacheKey) ?? Promise.resolve(false);

NextImage.removeFromCache = (uri: string, cacheKey = '') =>
  NextImageModule?.removeFromCache?.(uri, cacheKey) ?? Promise.resolve(false);

NextImage.getDiskCacheSize = () =>
  NextImageModule?.getDiskCacheSize?.() ?? Promise.resolve(0);

NextImage.getMemoryCacheSize = () =>
  NextImageModule?.getMemoryCacheSize?.() ?? Promise.resolve(0);

NextImage.setCacheLimits = ({ memoryBytes = 0, diskBytes = 0 }) => {
  if (memoryBytes < 0 || diskBytes < 0) {
    return Promise.reject(
      new Error('NextImage: cache limits must not be negative.')
    );
  }
  return (
    NextImageModule?.setCacheLimits?.(memoryBytes, diskBytes) ??
    Promise.resolve()
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

/**
 * True when the native view is linked on this platform. It is false on web and
 * in a bare Jest environment, where `NextImage` renders the platform image
 * instead and the cache APIs become no-ops.
 */
export const isNativeViewAvailable = NextImageView != null;

export { CACHE_CONTROLS, PRIORITIES, RESIZE_MODES, TRANSITIONS };
export default NextImage;
