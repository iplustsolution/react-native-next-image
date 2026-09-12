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
  bundledSource,
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
    /** `0` when the server sent no `Content-Length`. */
    total: number;
  };
}

export interface OnErrorEvent {
  nativeEvent: {
    error: string;
    /**
     * `HTTP_CLIENT`, `HTTP_SERVER`, `NETWORK`, `DECODE`, `CACHE_MISS`,
     * `UNKNOWN`, or a security code such as `INSECURE_SCHEME`.
     */
    code: string;
    /** HTTP status when the failure came from a response, otherwise 0. */
    status: number;
    /** Whether a manual retry could still succeed. */
    retryable: boolean;
  };
}

export type ImageStyle = RNImageStyle &
  ViewStyle & {
    overlayColor?: string;
  };

/** A bundled asset (`require('./a.png')`) or an absolute URL. */
export type LocalImage = ImageRequireSource | string;

export interface NextImageProps extends AccessibilityProps, ViewProps {
  source?: Source | ImageRequireSource;
  /** Shown when `source` fails. A bundled asset or an absolute URL. */
  defaultSource?: LocalImage;
  /** Shown while `source` loads. A bundled asset or an absolute URL. */
  placeholder?: LocalImage;
  resizeMode?: ResizeMode;
  transition?: Transition;
  transitionDuration?: number;
  /** Rounds the image and the container. Falls back to `style.borderRadius`. */
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
   * Cached images and bundled assets ignore this entirely and render
   * immediately.
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

type PreparedSource =
  | { kind: 'empty' }
  | { kind: 'ok'; source: NativeSource }
  | { kind: 'invalid'; code: SecurityErrorCode; message: string };

/**
 * `require()`d assets resolve through the packager. In development that is a
 * Metro dev server url, in release a bare drawable name (Android) or a
 * `file://` url inside the app bundle (iOS). All three are trusted by
 * construction and are marked `bundled` so native skips the URL policy.
 */
function prepareBundledAsset(asset: number): PreparedSource {
  const resolve = (
    Image as unknown as {
      resolveAssetSource?: (asset: number) => { uri?: string } | null;
    }
  ).resolveAssetSource;
  const uri = typeof resolve === 'function' ? resolve(asset)?.uri : undefined;
  if (typeof uri !== 'string' || uri.length === 0) {
    return { kind: 'empty' };
  }
  return { kind: 'ok', source: bundledSource(uri) };
}

function prepareSource(
  source: Source | ImageRequireSource | undefined
): PreparedSource {
  if (typeof source === 'number') {
    return prepareBundledAsset(source);
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

/** `placeholder` and `defaultSource` follow the same rules as `source`. */
function prepareLocalImage(value: LocalImage | undefined): PreparedSource {
  if (typeof value === 'number') {
    return prepareBundledAsset(value);
  }
  if (typeof value === 'string' && value.length > 0) {
    return prepareSource({ uri: value });
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

  const preparedPlaceholder = useMemo(
    () => prepareLocalImage(placeholder),
    [placeholder]
  );
  const preparedDefault = useMemo(
    () => prepareLocalImage(defaultSource),
    [defaultSource]
  );
  const nativePlaceholder =
    preparedPlaceholder.kind === 'ok' ? preparedPlaceholder.source : null;
  const nativeDefault =
    preparedDefault.kind === 'ok' ? preparedDefault.source : null;

  // A rejected placeholder is a developer mistake, not a load failure, so it
  // is only warned about.
  const placeholderWarning =
    preparedPlaceholder.kind === 'invalid'
      ? `NextImage: placeholder ignored: ${preparedPlaceholder.message}`
      : preparedDefault.kind === 'invalid'
        ? `NextImage: defaultSource ignored: ${preparedDefault.message}`
        : null;
  useEffect(() => {
    if (__DEV__ && placeholderWarning != null) {
      console.warn(placeholderWarning);
    }
  }, [placeholderWarning]);

  // Bundled assets are local, so there is nothing to defer.
  const gated =
    Number.isFinite(prefetchThreshold) &&
    prefetchThreshold >= 0 &&
    nativeSource?.bundled !== true;
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

  // `borderRadius` may come from the prop or from the style, like a plain
  // `<Image>`; the native view and the container both round to it.
  const flatStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const styleRadius = flatStyle?.borderRadius;
  const resolvedRadius = clampFloat(
    borderRadius ?? (typeof styleRadius === 'number' ? styleRadius : undefined),
    0,
    Number.MAX_SAFE_INTEGER,
    0
  );
  const circle = isCircle === true;

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
      cornerRadius: resolvedRadius,
      blurRadius: clampInt(blurRadius, 0, MAX_BLUR_RADIUS, 0),
      isCircle: circle,
      downsample: downsample !== false,
      grayscale: grayscale === true,
      retryCount: clampInt(retryCount, 0, MAX_RETRY_COUNT, 2),
      retryDelay: clampInt(retryDelay, 0, MAX_RETRY_DELAY_MS, 1000),
    }),
    [
      resizeModeProp,
      transitionProp,
      transitionDuration,
      resolvedRadius,
      blurRadius,
      circle,
      downsample,
      grayscale,
      retryCount,
      retryDelay,
    ]
  );

  // The container clips to the same shape, so a `backgroundColor` in `style`
  // never shows square corners behind a rounded image. A very large radius is
  // scaled down to half the shorter side, which is what makes a circle.
  const containerStyle = useMemo(
    () => [
      styles.container,
      style,
      circle
        ? styles.circle
        : resolvedRadius > 0
          ? { borderRadius: resolvedRadius }
          : null,
    ],
    [style, circle, resolvedRadius]
  );

  // Without a native view (web, or a missing autolink) fall back to the
  // platform image so the tree still renders.
  const NativeView = NextImageView;
  const fallbackSource = useMemo(() => {
    // react-native-web resolves bundled assets itself.
    if (typeof source === 'number') {
      return source;
    }
    if (nativeSource == null) {
      return null;
    }
    const headers: Record<string, string> = {};
    for (const header of nativeSource.headers) {
      headers[header.name] = header.value;
    }
    return { uri: nativeSource.uri, headers };
  }, [nativeSource, source]);

  return (
    <View {...rest} style={containerStyle} ref={setRef} onLayout={handleLayout}>
      {nativeSource != null && NativeView != null ? (
        <NativeView
          style={StyleSheet.absoluteFill}
          source={nativeSource}
          defaultSource={nativeDefault}
          placeholder={nativePlaceholder}
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
      {fallbackSource != null && NativeView == null ? (
        <Image
          style={StyleSheet.absoluteFill}
          source={fallbackSource}
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
  preload(sources: Array<Source | ImageRequireSource>): void;
  /** Warm the cache. Resolves when the batch has finished, with the number of images now cached. */
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

NextImage.preload = (sources: Array<Source | ImageRequireSource>) => {
  if (!Array.isArray(sources) || NextImageModule?.preload == null) {
    return;
  }
  const prepared: NativeSource[] = [];
  for (const candidate of sources) {
    const result = prepareSource(candidate);
    if (result.kind === 'ok') {
      prepared.push(result.source);
    } else if (result.kind === 'invalid' && __DEV__) {
      console.warn(`NextImage.preload: ${result.message}`);
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
  circle: {
    borderRadius: 9999,
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
