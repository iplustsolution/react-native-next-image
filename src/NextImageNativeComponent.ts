/* eslint-disable @react-native/no-deep-imports */
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type { ViewProps, ColorValue } from 'react-native';
import type {
  Float,
  WithDefault,
  BubblingEventHandler,
  Int32,
} from 'react-native/Libraries/Types/CodegenTypes';

type Headers = ReadonlyArray<Readonly<{ name: string; value: string }>>;
type Priority = WithDefault<'low' | 'normal' | 'high', 'normal'>;
type CacheControl = WithDefault<
  'immutable' | 'web' | 'cacheOnly' | 'reload',
  'immutable'
>;
type Transition = WithDefault<
  'fade' | 'none' | 'slide' | 'scale' | 'gravity',
  'none'
>;

type NextImageSource = Readonly<{
  uri?: string;
  headers?: Headers;
  priority?: Priority;
  cache?: CacheControl;
  /**
   * How long a downloaded image stays valid, in minutes.
   * Default is 10080 (7 days). Use decimals for sub-minute values.
   */
  cacheDuration?: Float;
  /**
   * Overrides the cache key, which defaults to the URI. Set this for signed
   * URLs so that a rotating token or expiry query parameter does not create a
   * new cache entry on every render.
   */
  cacheKey?: string;
}>;

type OnErrorEvent = Readonly<{
  error: string;
  /** Machine readable reason, e.g. `NETWORK`, `DECODE`, `CACHE_MISS`, `BLOCKED`. */
  code: string;
  /** HTTP status when the failure came from a response, otherwise 0. */
  status: Int32;
  /** Whether NextImage will retry this request on its own. */
  retryable: boolean;
}>;

type OnLoadEvent = Readonly<{
  width: Float;
  height: Float;
  /** Where the bytes came from: `memory`, `disk`, `network` or `unknown`. */
  cacheType: string;
  /** Wall clock time from request start to display, in milliseconds. */
  elapsed: Int32;
}>;

type OnProgressEvent = Readonly<{
  loaded: Int32;
  total: Int32;
}>;

interface NativeProps extends ViewProps {
  onNextImageError?: BubblingEventHandler<OnErrorEvent>;
  onNextImageLoad?: BubblingEventHandler<OnLoadEvent>;
  onNextImageLoadEnd?: BubblingEventHandler<Readonly<{}>>;
  onNextImageLoadStart?: BubblingEventHandler<Readonly<{}>>;
  onNextImageProgress?: BubblingEventHandler<OnProgressEvent>;
  source?: NextImageSource;
  defaultSource?: string | null;
  resizeMode?: WithDefault<'contain' | 'cover' | 'stretch' | 'center', 'cover'>;
  tintColor?: ColorValue;
  blurRadius?: Int32;
  transition?: Transition;
  transitionDuration?: Int32;
  borderRadius?: Float;
  isCircle?: WithDefault<boolean, false>;
  downsample?: WithDefault<boolean, true>;
  placeholder?: string | null;
  grayscale?: WithDefault<boolean, false>;
  /**
   * While true the view serves the image from cache only and never opens a
   * network connection. NextImage sets this for images that are still outside
   * the `prefetchThreshold` window, so a cached image renders immediately and
   * an uncached one waits.
   */
  deferNetwork?: WithDefault<boolean, false>;
  /** Attempts after the first failure. 0 disables retrying. */
  retryCount?: WithDefault<Int32, 2>;
  /** Delay before the first retry, in milliseconds. Doubles per attempt. */
  retryDelay?: WithDefault<Int32, 1000>;
}

export default codegenNativeComponent<NativeProps>('NextImageView');
