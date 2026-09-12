import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  DEFAULT_CACHE_DURATION_MINUTES,
  IMMUTABLE_CACHE_DURATION_MINUTES,
  clampFloat,
  clampInt,
  describeRejection,
  normalizeCacheDuration,
  normalizeEnum,
  resolveSource,
  toNativeHeaders,
  RESIZE_MODES,
} from '../props';
import { configureSecurity, resetSecurityConfig } from '../security';

beforeEach(() => {
  resetSecurityConfig();
});

describe('clampInt', () => {
  it('rounds and clamps into range', () => {
    expect(clampInt(5.6, 0, 10, 1)).toBe(6);
    expect(clampInt(-4, 0, 10, 1)).toBe(0);
    expect(clampInt(99, 0, 10, 1)).toBe(10);
  });

  it('falls back for values that are not numbers', () => {
    expect(clampInt(undefined, 0, 10, 3)).toBe(3);
    expect(clampInt(Number.NaN, 0, 10, 3)).toBe(3);
    expect(clampInt(Number.POSITIVE_INFINITY, 0, 10, 3)).toBe(3);
  });
});

describe('clampFloat', () => {
  it('keeps fractions but respects the bounds', () => {
    expect(clampFloat(2.5, 0, 10, 0)).toBe(2.5);
    expect(clampFloat(-1, 0, 10, 0)).toBe(0);
    expect(clampFloat(undefined, 0, 10, 4)).toBe(4);
  });
});

describe('normalizeEnum', () => {
  it('only accepts known values', () => {
    expect(normalizeEnum('contain', RESIZE_MODES, 'cover')).toBe('contain');
    expect(normalizeEnum('nope', RESIZE_MODES, 'cover')).toBe('cover');
    expect(normalizeEnum(undefined, RESIZE_MODES, 'cover')).toBe('cover');
  });
});

describe('normalizeCacheDuration', () => {
  it('treats an immutable source with no duration as never expiring', () => {
    expect(normalizeCacheDuration(undefined, 'immutable')).toBe(
      IMMUTABLE_CACHE_DURATION_MINUTES
    );
  });

  it('uses seven days for the other cache modes', () => {
    expect(normalizeCacheDuration(undefined, 'web')).toBe(
      DEFAULT_CACHE_DURATION_MINUTES
    );
  });

  it('keeps an explicit duration, including sub-minute values', () => {
    expect(normalizeCacheDuration(60, 'immutable')).toBe(60);
    expect(normalizeCacheDuration(0.5, 'immutable')).toBe(0.5);
  });

  it('maps a non-positive duration to no caching', () => {
    expect(normalizeCacheDuration(0, 'immutable')).toBe(0);
    expect(normalizeCacheDuration(-10, 'immutable')).toBe(0);
  });
});

describe('toNativeHeaders', () => {
  it('converts the map into the array the native views expect', () => {
    expect(toNativeHeaders({ A: '1', B: '2' })).toEqual([
      { name: 'A', value: '1' },
      { name: 'B', value: '2' },
    ]);
  });
});

describe('resolveSource', () => {
  it('reports an empty source', () => {
    expect(resolveSource(undefined).kind).toBe('empty');
    expect(resolveSource(null).kind).toBe('empty');
    expect(resolveSource({}).kind).toBe('empty');
    expect(resolveSource({ uri: '' }).kind).toBe('empty');
  });

  it('normalises a full source', () => {
    const result = resolveSource({
      uri: 'https://example.com/a.jpg',
      headers: { Authorization: 'Bearer t' },
      priority: 'high',
      cache: 'web',
      cacheDuration: 60,
      cacheKey: 'stable-key',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }
    expect(result.source).toEqual({
      uri: 'https://example.com/a.jpg',
      headers: [{ name: 'Authorization', value: 'Bearer t' }],
      priority: 'high',
      cache: 'web',
      cacheDuration: 60,
      cacheKey: 'stable-key',
      bundled: false,
    });
  });

  it('defaults to an immutable, never expiring entry', () => {
    const result = resolveSource({ uri: 'https://example.com/a.jpg' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }
    expect(result.source.cache).toBe('immutable');
    expect(result.source.cacheDuration).toBe(IMMUTABLE_CACHE_DURATION_MINUTES);
    expect(result.source.priority).toBe('normal');
    expect(result.source.cacheKey).toBe('');
  });

  it('falls back for unknown enum values', () => {
    const result = resolveSource({
      uri: 'https://example.com/a.jpg',
      // @ts-expect-error deliberately invalid input from untyped JS
      priority: 'urgent',
      // @ts-expect-error deliberately invalid input from untyped JS
      cache: 'forever',
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }
    expect(result.source.priority).toBe('normal');
    expect(result.source.cache).toBe('immutable');
  });

  it('reports rejected headers while keeping the valid ones', () => {
    const result = resolveSource({
      uri: 'https://example.com/a.jpg',
      headers: { 'X-Ok': 'yes', 'X-Bad': 'a\r\nb' },
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }
    expect(result.source.headers).toEqual([{ name: 'X-Ok', value: 'yes' }]);
    expect(result.rejectedHeaders).toHaveLength(1);
  });

  it('reports a blocked uri instead of throwing', () => {
    const result = resolveSource({ uri: 'http://example.com/a.jpg' });
    expect(result.kind).toBe('invalid');
    if (result.kind !== 'invalid') {
      return;
    }
    expect(result.code).toBe('INSECURE_SCHEME');
  });

  it('follows the active security configuration', () => {
    configureSecurity({ allowedHosts: ['cdn.example.com'] });
    expect(resolveSource({ uri: 'https://other.example.com/a.jpg' }).kind).toBe(
      'invalid'
    );
    expect(resolveSource({ uri: 'https://cdn.example.com/a.jpg' }).kind).toBe(
      'ok'
    );
  });
});

describe('describeRejection', () => {
  it('keeps secrets out of the message', () => {
    expect(
      describeRejection('https://example.com/a.jpg?token=secret', 'Blocked.')
    ).toBe('Blocked. (https://example.com/a.jpg?<redacted>)');
  });
});
