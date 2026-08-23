import { codegenNativeComponent } from 'react-native';
import type { ViewProps, ColorValue } from 'react-native';
import type {
  Float,
  WithDefault,
  BubblingEventHandler,
  Int32,
} from 'react-native/Libraries/Types/CodegenTypes';

type Headers = ReadonlyArray<Readonly<{ name: string; value: string }>>;
type Priority = WithDefault<'low' | 'normal' | 'high', 'normal'>;
type CacheControl = WithDefault<'immutable' | 'web' | 'cacheOnly', 'web'>;
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
   * Cache duration in minutes.
   * Default is 10080 (7 days).
   * For seconds, use decimals (e.g. 0.5 for 30s).
   */
  cacheDuration?: Float;
}>;

type OnErrorEvent = Readonly<{
  error: string;
}>;

type OnLoadEvent = Readonly<{
  width: Float;
  height: Float;
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
  downsample?: WithDefault<boolean, false>;
  placeholder?: string | null;
  grayscale?: WithDefault<boolean, false>;
}

export default codegenNativeComponent<NativeProps>('NextImageView');
