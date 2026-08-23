import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type Priority = 'low' | 'normal' | 'high';
export type Cache = 'immutable' | 'web' | 'cacheOnly';

export type Source = {
  uri?: string;
  headers?: { [key: string]: string };
  priority?: Priority;
  cache?: Cache;
};

export interface Spec extends TurboModule {
  preload: (sources: Source[]) => void;
  clearMemoryCache: () => Promise<void>;
  clearDiskCache: () => Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NextImageModule');
