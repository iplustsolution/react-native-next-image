import { codegenNativeComponent } from 'react-native';
import type { ViewProps, ColorValue } from 'react-native';
import type {
  Float,
  WithDefault,
  BubblingEventHandler,
  Int32,
} from 'react-native/Libraries/Types/CodegenTypes';

type Headers = ReadonlyArray<Readonly<{ name: string; value: string }>>;
type Transition = WithDefault<
  'fade' | 'none' | 'slide' | 'scale' | 'gravity',
  'none'
>;

/**
 * One shape for `source`, `placeholder` and `defaultSource`, so all three go
 * through the same validation, cache rules and local asset handling natively.
 *
 * `priority` and `cache` are plain strings here rather than string unions:
 * codegen names a nested enum after its field alone, so the same union in
 * three structs would generate three conflicting C++ enums. The JS layer only
 * ever sends the known values, and native falls back to the default otherwise.
 */
type NextImageSource = Readonly<{
  uri?: string;
  headers?: Headers;
  /** `low`, `normal` (default) or `high`. */
  priority?: string;
  /** `immutable` (default), `web`, `cacheOnly` or `reload`. */
  cache?: string;
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
  /**
   * True for a `require()`d asset: Metro serves it over plain http in
   * development and the app bundle holds it in release (a bare drawable name
   * on Android, a `file://` url on iOS). Bundled sources skip the URL policy.
   */
  bundled?: WithDefault<boolean, false>;
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
  /** Shown when `source` fails. */
  defaultSource?: NextImageSource;
  /** Shown while `source` loads. */
  placeholder?: NextImageSource;
  resizeMode?: WithDefault<'contain' | 'cover' | 'stretch' | 'center', 'cover'>;
  tintColor?: ColorValue;
  blurRadius?: Int32;
  transition?: Transition;
  transitionDuration?: Int32;
  /** Named apart from the view style's `borderRadius`, which Fabric parses on every component. */
  cornerRadius?: Float;
  isCircle?: WithDefault<boolean, false>;
  downsample?: WithDefault<boolean, true>;
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
