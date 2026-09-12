import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

export type Priority = 'low' | 'normal' | 'high';
export type Cache = 'immutable' | 'web' | 'cacheOnly' | 'reload';

export type Header = {
  name: string;
  value: string;
};

export type Source = {
  uri?: string;
  headers?: Array<Header>;
  priority?: Priority;
  cache?: Cache;
  cacheDuration?: number;
  cacheKey?: string;
  /** True for a `require()`d asset, which skips the URL policy. */
  bundled?: boolean;
};

export interface Spec extends TurboModule {
  /** Warm the cache for images that are not on screen yet. */
  preload(sources: Array<Source>): void;
  /** Like `preload`, but resolves once the batch is done with how many images are now cached. */
  prefetch(uris: Array<string>, priority: string): Promise<number>;
  clearMemoryCache(): Promise<void>;
  clearDiskCache(): Promise<void>;
  /** True when the image can be served without a network request. */
  isCached(uri: string, cacheKey: string): Promise<boolean>;
  /** Remove one entry from both cache tiers. Resolves true when something was removed. */
  removeFromCache(uri: string, cacheKey: string): Promise<boolean>;
  /** Bytes currently held on disk. */
  getDiskCacheSize(): Promise<number>;
  /** Bytes currently held in memory. */
  getMemoryCacheSize(): Promise<number>;
  /**
   * Resize the cache tiers. Pass 0 to keep the current value for a tier.
   * Rebuilds the loader, so in-flight requests are cancelled.
   */
  setCacheLimits(memoryBytes: number, diskBytes: number): Promise<void>;
  /** Push the JS security and cache configuration down to the native loader. */
  configure(options: UnsafeObject): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NextImageModule');
