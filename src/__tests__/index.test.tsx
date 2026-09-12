import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Dimensions, Text } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

const mockNativeModule = {
  preload: jest.fn(),
  prefetch: jest.fn(async () => 0),
  clearMemoryCache: jest.fn(async () => undefined),
  clearDiskCache: jest.fn(async () => undefined),
  isCached: jest.fn(async () => true),
  removeFromCache: jest.fn(async () => true),
  getDiskCacheSize: jest.fn(async () => 1024),
  getMemoryCacheSize: jest.fn(async () => 512),
  setCacheLimits: jest.fn(async () => undefined),
  configure: jest.fn(),
};

jest.mock('../NativeNextImageModule', () => ({
  __esModule: true,
  default: mockNativeModule,
}));

jest.mock('../NextImageNativeComponent', () => ({
  __esModule: true,
  default: 'NextImageView',
}));

// Pretend Fabric is active so the component resolves the codegen view and the
// turbo module rather than the legacy bridge lookups.
(global as unknown as { nativeFabricUIManager: object }).nativeFabricUIManager =
  {};

const NextImageModule = require('../index') as typeof import('../index');
const { resetViewportTracker } =
  require('../viewport') as typeof import('../viewport');
const { resetSecurityConfig } =
  require('../security') as typeof import('../security');

const NextImage = NextImageModule.default;

const viewport = { width: 400, height: 800, scale: 2, fontScale: 1 };

function findNative(root: ReactTestInstance): ReactTestInstance | null {
  // The codegen component is mocked as a host component named after the view.
  const matches = root.findAll(
    (node) => (node.type as unknown as string) === 'NextImageView',
    { deep: true }
  );
  return matches[0] ?? null;
}

beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetViewportTracker();
  resetSecurityConfig();
});

describe('rendering', () => {
  it('renders the native view with normalised props', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        <NextImage
          source={{
            uri: 'https://example.com/a.jpg',
            headers: { Authorization: 'Bearer t' },
            priority: 'high',
            cacheDuration: 60,
          }}
          resizeMode="contain"
          transition="fade"
          transitionDuration={99999}
          blurRadius={500}
          borderRadius={-4}
          retryCount={99}
          prefetchThreshold={Number.POSITIVE_INFINITY}
        />
      );
    });

    const native = findNative(tree!.root);
    expect(native).not.toBeNull();
    const props = native!.props as Record<string, unknown>;

    expect(props.source).toEqual({
      uri: 'https://example.com/a.jpg',
      headers: [{ name: 'Authorization', value: 'Bearer t' }],
      priority: 'high',
      cache: 'immutable',
      cacheDuration: 60,
      cacheKey: '',
    });
    expect(props.resizeMode).toBe('contain');
    expect(props.transition).toBe('fade');
    // Out-of-range numbers are clamped rather than passed to native.
    expect(props.transitionDuration).toBe(10000);
    expect(props.blurRadius).toBe(100);
    expect(props.borderRadius).toBe(0);
    expect(props.retryCount).toBe(10);
    expect(props.downsample).toBe(true);
  });

  it('renders children over the image', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        <NextImage source={{ uri: 'https://example.com/a.jpg' }}>
          <Text>overlay</Text>
        </NextImage>
      );
    });

    expect(tree!.root.findByType(Text).props.children).toBe('overlay');
  });

  it('renders nothing native without a source', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<NextImage />);
    });
    expect(findNative(tree!.root)).toBeNull();
  });

  it('reports a blocked source through onError without touching native', () => {
    const onError = jest.fn();
    const onLoadEnd = jest.fn();
    let tree: ReturnType<typeof create> | undefined;

    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'http://example.com/a.jpg' }}
          onError={onError}
          onLoadEnd={onLoadEnd}
        />
      );
    });

    expect(findNative(tree!.root)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    const event = onError.mock.calls[0]?.[0] as {
      nativeEvent: { code: string; retryable: boolean; error: string };
    };
    expect(event.nativeEvent.code).toBe('INSECURE_SCHEME');
    expect(event.nativeEvent.retryable).toBe(false);
    // The uri is named so the developer can find it, with the query string
    // stripped so a token cannot leak into a crash report.
    expect(event.nativeEvent.error).toContain('http://example.com/a.jpg');
    expect(onLoadEnd).toHaveBeenCalledTimes(1);
  });

  it('reports a blocked source once, not on every render', () => {
    const onError = jest.fn();
    let tree: ReturnType<typeof create> | undefined;

    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'http://example.com/a.jpg' }}
          onError={onError}
        />
      );
    });
    // A fresh but equal source object, and a fresh inline handler, are what a
    // normal render produces; neither is a new failure.
    act(() => {
      tree!.update(
        <NextImage
          source={{ uri: 'http://example.com/a.jpg' }}
          onError={onError}
          onLoadEnd={() => undefined}
        />
      );
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps the query string out of the reported error', () => {
    const onError = jest.fn();
    act(() => {
      create(
        <NextImage
          source={{ uri: 'https://10.0.0.1/a.jpg?token=secret' }}
          onError={onError}
        />
      );
    });

    const message = (
      onError.mock.calls[0]?.[0] as { nativeEvent: { error: string } }
    ).nativeEvent.error;
    expect(message).toContain('<redacted>');
    expect(message).not.toContain('secret');
  });

  it('reports again when the source changes to a different blocked url', () => {
    const onError = jest.fn();
    let tree: ReturnType<typeof create> | undefined;

    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'http://example.com/a.jpg' }}
          onError={onError}
        />
      );
    });
    act(() => {
      tree!.update(
        <NextImage
          source={{ uri: 'ftp://example.com/b.jpg' }}
          onError={onError}
        />
      );
    });

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('maps event handlers onto the native event props', () => {
    const onLoad = jest.fn();
    const onProgress = jest.fn();
    let tree: ReturnType<typeof create> | undefined;

    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'https://example.com/a.jpg' }}
          onLoad={onLoad}
          onProgress={onProgress}
          prefetchThreshold={Number.POSITIVE_INFINITY}
        />
      );
    });

    const props = findNative(tree!.root)!.props as Record<string, unknown>;
    expect(props.onNextImageLoad).toBe(onLoad);
    expect(props.onNextImageProgress).toBe(onProgress);
  });
});

describe('prefetchThreshold gating', () => {
  it('never defers the network when gating is disabled', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'https://example.com/a.jpg' }}
          prefetchThreshold={Number.POSITIVE_INFINITY}
        />
      );
    });

    const props = findNative(tree!.root)!.props as Record<string, unknown>;
    expect(props.deferNetwork).toBe(false);
  });

  it('mounts the native view even while deferred, so a cached image renders', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'https://example.com/a.jpg' }}
          prefetchThreshold={0}
        />
      );
    });

    // The node is not measurable in the test renderer, so it stays deferred:
    // the view is still mounted and may serve the image from cache.
    const native = findNative(tree!.root);
    expect(native).not.toBeNull();
    expect((native!.props as Record<string, unknown>).deferNetwork).toBe(true);
  });

  it('releases a deferred image when gating is switched off', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(
        <NextImage
          source={{ uri: 'https://example.com/a.jpg' }}
          prefetchThreshold={0}
        />
      );
    });
    expect(
      (findNative(tree!.root)!.props as Record<string, unknown>).deferNetwork
    ).toBe(true);

    act(() => {
      tree!.update(
        <NextImage
          source={{ uri: 'https://example.com/a.jpg' }}
          prefetchThreshold={Number.POSITIVE_INFINITY}
        />
      );
    });
    expect(
      (findNative(tree!.root)!.props as Record<string, unknown>).deferNetwork
    ).toBe(false);
  });
});

describe('static cache api', () => {
  it('exposes the prop enums', () => {
    expect(NextImage.resizeMode.cover).toBe('cover');
    expect(NextImage.priority.high).toBe('high');
    expect(NextImage.cacheControl.immutable).toBe('immutable');
    expect(NextImage.transition.gravity).toBe('gravity');
  });

  it('preloads only the sources that pass the security policy', () => {
    NextImage.preload([
      { uri: 'https://example.com/a.jpg' },
      { uri: 'http://example.com/b.jpg' },
      // eslint-disable-next-line no-script-url -- the point is that it is refused
      { uri: 'javascript:alert(1)' },
    ]);

    expect(mockNativeModule.preload).toHaveBeenCalledTimes(1);
    const sources = mockNativeModule.preload.mock.calls[0]?.[0] as {
      uri: string;
    }[];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.uri).toBe('https://example.com/a.jpg');
  });

  it('does not call native when every preload source is blocked', () => {
    NextImage.preload([{ uri: 'http://example.com/b.jpg' }]);
    expect(mockNativeModule.preload).not.toHaveBeenCalled();
  });

  it('filters prefetch urls and normalises the priority', async () => {
    await NextImage.prefetch(
      ['https://example.com/a.jpg', 'ftp://example.com/b.jpg'],
      // @ts-expect-error deliberately invalid input from untyped JS
      'urgent'
    );

    expect(mockNativeModule.prefetch).toHaveBeenCalledWith(
      ['https://example.com/a.jpg'],
      'normal'
    );
  });

  it('resolves to zero without calling native when nothing is valid', async () => {
    await expect(NextImage.prefetch(['ftp://example.com/b.jpg'])).resolves.toBe(
      0
    );
    expect(mockNativeModule.prefetch).not.toHaveBeenCalled();
  });

  it('delegates the cache queries', async () => {
    await expect(NextImage.isCached('https://example.com/a.jpg')).resolves.toBe(
      true
    );
    expect(mockNativeModule.isCached).toHaveBeenCalledWith(
      'https://example.com/a.jpg',
      ''
    );

    await expect(
      NextImage.removeFromCache('https://example.com/a.jpg', 'key')
    ).resolves.toBe(true);
    expect(mockNativeModule.removeFromCache).toHaveBeenCalledWith(
      'https://example.com/a.jpg',
      'key'
    );

    await expect(NextImage.getDiskCacheSize()).resolves.toBe(1024);
    await expect(NextImage.getMemoryCacheSize()).resolves.toBe(512);
    await NextImage.clearMemoryCache();
    await NextImage.clearDiskCache();
    expect(mockNativeModule.clearMemoryCache).toHaveBeenCalled();
    expect(mockNativeModule.clearDiskCache).toHaveBeenCalled();
  });

  it('rejects negative cache limits before reaching native', async () => {
    await expect(NextImage.setCacheLimits({ diskBytes: -1 })).rejects.toThrow(
      /must not be negative/
    );
    expect(mockNativeModule.setCacheLimits).not.toHaveBeenCalled();

    await NextImage.setCacheLimits({ memoryBytes: 1024, diskBytes: 2048 });
    expect(mockNativeModule.setCacheLimits).toHaveBeenCalledWith(1024, 2048);
  });
});

describe('configure', () => {
  it('applies the policy in JS and forwards it to native', () => {
    NextImage.configure({
      allowInsecureHttp: true,
      allowedHosts: ['cdn.example.com'],
      diskCacheBytes: 1024,
    });

    expect(NextImage.getConfig().allowInsecureHttp).toBe(true);
    expect(NextImage.getConfig().allowedHosts).toEqual(['cdn.example.com']);
    expect(mockNativeModule.configure).toHaveBeenCalledWith({
      allowInsecureHttp: true,
      allowedHosts: ['cdn.example.com'],
      diskCacheBytes: 1024,
    });
  });

  it('refuses a malformed certificate pin', () => {
    expect(() =>
      NextImage.configure({
        certificatePins: { 'cdn.example.com': ['sha256/nope'] },
      })
    ).toThrow(/not a valid sha256/);
    expect(mockNativeModule.configure).not.toHaveBeenCalled();
  });
});
