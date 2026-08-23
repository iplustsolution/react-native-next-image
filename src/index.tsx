import React, { forwardRef, memo, useState, useEffect, useRef } from 'react';
import {
  View,
  NativeModules,
  StyleSheet,
  Platform,
  Image,
  Dimensions,
  requireNativeComponent,
} from 'react-native';
import type {
  LayoutChangeEvent,
  StyleProp,
  ImageRequireSource,
  AccessibilityProps,
  ViewProps,
  ColorValue,
  ViewStyle,
  ImageStyle as RNImageStyle,
} from 'react-native';

const isFabricEnabled = (global as any)?.nativeFabricUIManager != null;
const isTurboModuleEnabled = (global as any).__turboModuleProxy != null;

const NextImageModule = isTurboModuleEnabled
  ? require('./NativeNextImageModule').default
  : NativeModules.NextImageModule;

const NextImageView = isFabricEnabled
  ? require('./NextImageNativeComponent').default
  : requireNativeComponent('NextImageView');

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center';

const resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center',
} as const;

export type Priority = 'low' | 'normal' | 'high';

const priority = {
  low: 'low',
  normal: 'normal',
  high: 'high',
} as const;

export type Transition = 'fade' | 'none' | 'slide' | 'scale' | 'gravity';

const transition = {
  fade: 'fade',
  none: 'none',
  slide: 'slide',
  scale: 'scale',
  gravity: 'gravity',
} as const;

export type Cache = 'immutable' | 'web' | 'cacheOnly';

const cacheControl = {
  immutable: 'immutable',
  web: 'web',
  cacheOnly: 'cacheOnly',
} as const;

export type Source = {
  uri?: string;
  headers?: { [key: string]: string };
  priority?: Priority;
  cache?: Cache;
  /**
   * Cache duration in minutes.
   * Default: 10080 (7 days).
   * Example: 60 (1 hour), 0.5 (30 seconds).
   */
  cacheDuration?: number;
};

export interface OnLoadEvent {
  nativeEvent: {
    width: number;
    height: number;
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
  };
}

export type ImageStyle = RNImageStyle &
  ViewStyle & {
    overlayColor?: string;
  };

export interface NextImageProps extends AccessibilityProps, ViewProps {
  source?: Source | ImageRequireSource;
  defaultSource?: ImageRequireSource;
  resizeMode?: ResizeMode;
  transition?: Transition;
  transitionDuration?: number;
  borderRadius?: number;
  isCircle?: boolean;
  downsample?: boolean;
  placeholder?: string;
  grayscale?: boolean;
  /**
   * Pre-fetch threshold as a multiple of screen size.
   * Default: 4 (400%).
   */
  prefetchThreshold?: number;
  onLoadStart?(): void;
  onProgress?(event: OnProgressEvent): void;
  onLoad?(event: OnLoadEvent): void;
  onError?(event: OnErrorEvent): void;
  onLoadEnd?(): void;
  onLayout?: (event: LayoutChangeEvent) => void;
  style?: StyleProp<ImageStyle>;
  tintColor?: ColorValue;
  blurRadius?: number;
  testID?: string;
  children?: React.ReactNode;
}

const resolveDefaultSource = (
  defaultSource?: ImageRequireSource
): string | null => {
  if (!defaultSource) {
    return null;
  }
  const resolved = Image.resolveAssetSource(defaultSource);
  return resolved ? resolved.uri : null;
};

function NextImageBase({
  source,
  defaultSource,
  tintColor,
  blurRadius,
  onLoadStart,
  onProgress,
  onLoad,
  onError,
  onLoadEnd,
  style,
  children,
  transition: transitionProp,
  transitionDuration,
  borderRadius,
  isCircle,
  downsample,
  placeholder,
  grayscale,
  prefetchThreshold = 4,
  resizeMode: resizeModeProp = 'cover',
  forwardedRef,
  ...props
}: NextImageProps & { forwardedRef: React.Ref<any> }) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const viewRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;
    const checkProximity = () => {
      if (!isMounted || shouldLoad) return;
      if (
        viewRef.current &&
        typeof viewRef.current.measureInWindow === 'function'
      ) {
        viewRef.current.measureInWindow(
          (x: number, y: number, width: number, height: number) => {
            if (!isMounted) return;

            const thresholdHeight = SCREEN_HEIGHT * prefetchThreshold;
            const thresholdWidth = SCREEN_WIDTH * prefetchThreshold;

            const isNearViewport =
              y < thresholdHeight &&
              y + height > -thresholdHeight &&
              x < thresholdWidth &&
              x + width > -thresholdWidth;

            if (isNearViewport) {
              setShouldLoad(true);
            }
          }
        );
      }
    };

    checkProximity();
    const interval = setInterval(checkProximity, 500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [shouldLoad, prefetchThreshold]);

  const resolvedSource = Image.resolveAssetSource(source as any) as any;
  let modifiedSource = resolvedSource;

  if (
    resolvedSource?.headers &&
    (isFabricEnabled || Platform.OS === 'android')
  ) {
    const headersArray: { name: string; value: string }[] = [];
    Object.keys(resolvedSource.headers).forEach((key) => {
      headersArray.push({ name: key, value: resolvedSource.headers[key] });
    });
    modifiedSource = { ...resolvedSource, headers: headersArray };
  }

  const resolvedDefaultSource = resolveDefaultSource(defaultSource);

  return (
    <View
      style={[styles.imageContainer, style]}
      ref={(ref) => {
        viewRef.current = ref;
        if (typeof forwardedRef === 'function') forwardedRef(ref);
        else if (forwardedRef) (forwardedRef as any).current = ref;
      }}
      onLayout={props.onLayout}
    >
      {shouldLoad && (
        <NextImageView
          {...props}
          tintColor={tintColor}
          style={StyleSheet.absoluteFill}
          source={modifiedSource}
          defaultSource={resolvedDefaultSource}
          onNextImageLoadStart={onLoadStart}
          onNextImageProgress={onProgress}
          onNextImageLoad={onLoad}
          onNextImageError={onError}
          onNextImageLoadEnd={onLoadEnd}
          resizeMode={resizeModeProp}
          transition={transitionProp}
          blurRadius={blurRadius}
          transitionDuration={transitionDuration}
          borderRadius={borderRadius}
          isCircle={isCircle}
          downsample={downsample}
          placeholder={placeholder}
          grayscale={grayscale}
        />
      )}
      {children}
    </View>
  );
}

const NextImageMemo = memo(NextImageBase);

const NextImageComponent: React.ComponentType<NextImageProps> = forwardRef(
  (props: NextImageProps, ref: React.Ref<any>) => (
    <NextImageMemo forwardedRef={ref} {...props} />
  )
);

NextImageComponent.displayName = 'NextImage';

export interface NextImageStaticProperties {
  resizeMode: typeof resizeMode;
  priority: typeof priority;
  cacheControl: typeof cacheControl;
  transition: typeof transition;
  preload: (sources: Source[]) => void;
  clearMemoryCache: () => Promise<void>;
  clearDiskCache: () => Promise<void>;
}

const NextImage: React.ComponentType<NextImageProps> &
  NextImageStaticProperties = NextImageComponent as any;

NextImage.resizeMode = resizeMode;
NextImage.cacheControl = cacheControl;
NextImage.priority = priority;
NextImage.transition = transition;

NextImage.preload = (sources: Source[]) => {
  if (NextImageModule?.preload) {
    NextImageModule.preload(sources);
  }
};

NextImage.clearMemoryCache = () =>
  NextImageModule?.clearMemoryCache?.() || Promise.resolve();
NextImage.clearDiskCache = () =>
  NextImageModule?.clearDiskCache?.() || Promise.resolve();

const styles = StyleSheet.create({
  imageContainer: {
    overflow: 'hidden',
  },
});

export default NextImage;
