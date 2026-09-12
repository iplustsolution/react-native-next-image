/**
 * Prop normalisation.
 *
 * Every value that crosses the bridge is clamped and validated here so that a
 * bad prop becomes a predictable JS error instead of an out-of-range value in
 * Kotlin or Swift, where it would surface as a crash or a silently broken
 * layout.
 */

import {
  redactUri,
  sanitizeHeaders,
  validateUri,
  type HeaderRejection,
  type SecurityErrorCode,
} from './security';

export type ResizeMode = 'contain' | 'cover' | 'stretch' | 'center';
export type Priority = 'low' | 'normal' | 'high';
export type Transition = 'fade' | 'none' | 'slide' | 'scale' | 'gravity';

/**
 * - `immutable`: cache until `cacheDuration` elapses and ignore server cache
 *   headers. This is the default and the reason an image is fetched once.
 * - `web`: honour the server's `Cache-Control`/`ETag` headers.
 * - `cacheOnly`: never touch the network; fail when the entry is missing.
 * - `reload`: skip the cache for this request and refresh the entry.
 */
export type Cache = 'immutable' | 'web' | 'cacheOnly' | 'reload';

export const RESIZE_MODES: readonly ResizeMode[] = [
  'contain',
  'cover',
  'stretch',
  'center',
];
export const PRIORITIES: readonly Priority[] = ['low', 'normal', 'high'];
export const TRANSITIONS: readonly Transition[] = [
  'fade',
  'none',
  'slide',
  'scale',
  'gravity',
];
export const CACHE_CONTROLS: readonly Cache[] = [
  'immutable',
  'web',
  'cacheOnly',
  'reload',
];

/** 7 days, in minutes. */
export const DEFAULT_CACHE_DURATION_MINUTES = 10080;
/** Roughly 10 years, in minutes: the effective TTL of `cache: 'immutable'`. */
export const IMMUTABLE_CACHE_DURATION_MINUTES = 5256000;
export const MAX_TRANSITION_DURATION_MS = 10000;
export const MAX_BLUR_RADIUS = 100;
export const MAX_RETRY_COUNT = 10;
export const MAX_RETRY_DELAY_MS = 60000;

export type Source = {
  uri?: string;
  headers?: Record<string, string>;
  priority?: Priority;
  cache?: Cache;
  /** Cache lifetime in minutes. Defaults to 7 days. */
  cacheDuration?: number;
  /**
   * Stable cache key. Set this for signed URLs whose query string changes on
   * every render, otherwise each signature creates a new cache entry.
   */
  cacheKey?: string;
};

export type NativeHeader = { name: string; value: string };

export type NativeSource = {
  uri: string;
  headers: NativeHeader[];
  priority: Priority;
  cache: Cache;
  cacheDuration: number;
  cacheKey: string;
};

export type SourceResolution =
  | { kind: 'empty' }
  | { kind: 'ok'; source: NativeSource; rejectedHeaders: HeaderRejection[] }
  | { kind: 'invalid'; code: SecurityErrorCode; message: string };

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/** Round to an integer inside `[min, max]`, falling back to `fallback`. */
export function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(clamp(value, min, max));
}

/** Clamp to `[min, max]` without rounding, falling back to `fallback`. */
export function clampFloat(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number
): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, min, max);
}

export function normalizeEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T
): T {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as T;
  }
  return fallback;
}

/**
 * `cache: 'immutable'` means "never re-validate", which is expressed as a very
 * long TTL rather than a special case in each native loader.
 */
export function normalizeCacheDuration(
  cacheDuration: number | undefined,
  cache: Cache
): number {
  if (cache === 'immutable' && cacheDuration === undefined) {
    return IMMUTABLE_CACHE_DURATION_MINUTES;
  }
  if (cacheDuration === undefined || !Number.isFinite(cacheDuration)) {
    return DEFAULT_CACHE_DURATION_MINUTES;
  }
  if (cacheDuration <= 0) {
    return 0;
  }
  return clampFloat(
    cacheDuration,
    0,
    IMMUTABLE_CACHE_DURATION_MINUTES,
    DEFAULT_CACHE_DURATION_MINUTES
  );
}

export function toNativeHeaders(
  headers: Record<string, string>
): NativeHeader[] {
  return Object.keys(headers).map((name) => ({
    name,
    value: headers[name] as string,
  }));
}

/**
 * Validate and normalise a source object into the shape the native views
 * expect. Never throws: an unusable source is reported as `invalid` so the
 * component can surface it through `onError`.
 */
export function resolveSource(
  source: Source | null | undefined
): SourceResolution {
  if (source == null || typeof source !== 'object') {
    return { kind: 'empty' };
  }

  const rawUri = source.uri;
  if (rawUri === undefined || rawUri === null || rawUri === '') {
    return { kind: 'empty' };
  }

  const validation = validateUri(rawUri);
  if (!validation.ok) {
    return {
      kind: 'invalid',
      code: validation.code,
      message: validation.message,
    };
  }

  const { headers, rejected } = sanitizeHeaders(source.headers);
  const cache = normalizeEnum(source.cache, CACHE_CONTROLS, 'immutable');

  return {
    kind: 'ok',
    rejectedHeaders: rejected,
    source: {
      uri: validation.uri,
      headers: toNativeHeaders(headers),
      priority: normalizeEnum(source.priority, PRIORITIES, 'normal'),
      cache,
      cacheDuration: normalizeCacheDuration(source.cacheDuration, cache),
      cacheKey:
        typeof source.cacheKey === 'string' && source.cacheKey.length > 0
          ? source.cacheKey
          : '',
    },
  };
}

/** Human readable, credential-free description of a rejected source. */
export function describeRejection(uri: string, message: string): string {
  return `${message} (${redactUri(uri)})`;
}
