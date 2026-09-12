<div align="center">

<img src="https://www.iplust.in/logo.png" alt="react-native-next-image logo" width="120" />

# react-native-next-image

**Image loading for React Native that downloads a URL once and renders it from cache after that.**

Built for the New Architecture. Powered by **Coil 3** on Android and **Kingfisher 8** on iOS.

[![npm version](https://img.shields.io/npm/v/react-native-next-image.svg?color=6366f1&label=npm)](https://www.npmjs.com/package/react-native-next-image)
[![npm downloads](https://img.shields.io/npm/dm/react-native-next-image.svg?color=6366f1)](https://www.npmjs.com/package/react-native-next-image)
[![platforms](https://img.shields.io/badge/platform-iOS%20%7C%20Android-6366f1.svg)](#)
[![license](https://img.shields.io/npm/l/react-native-next-image.svg?color=6366f1)](./LICENSE)

</div>

---

## ⚠️ Status: pre-1.0

> [!CAUTION]
> The API is still settling. Pin an exact version, read the release notes
> before upgrading, and test on both platforms before shipping.

---

## Why

`<Image>` re-requests images more often than you would like, gives you no say
over how long one stays cached, and cannot tell you where a render came from.
`NextImage` fixes that with one rule:

**A URL is fetched from the network at most once per cache lifetime. Every
render after that comes from memory or disk, even offline, even across app
restarts.**

Everything else in this library exists to support that rule.

---

## Requirements

| | Minimum |
| :--- | :--- |
| React Native | 0.80 (New Architecture) |
| iOS | 15.1 |
| Android | API 24, Kotlin 2.0.21 |

---

## Installation

```bash
yarn add react-native-next-image
# or
npm install react-native-next-image
```

### iOS

`NextImage` depends on [Kingfisher](https://github.com/onevcat/Kingfisher).
Two of Kingfisher's build settings do not survive a static-library CocoaPods
install, which is what a React Native app uses unless it opts into
`use_frameworks!`, so the package ships a helper that fixes them. Add two lines
to your `ios/Podfile`:

```ruby
require_relative '../node_modules/react-native-next-image/scripts/next_image_pods'

# ...

post_install do |installer|
  react_native_post_install(installer, config[:reactNativePath])
  next_image_post_install(installer)
end
```

Then:

```bash
cd ios && pod install
```

Without the helper, the build fails with
`underlying Objective-C module 'Kingfisher' not found` and, on Xcode 27, with
`The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 13.0`.
[`scripts/next_image_pods.rb`](./scripts/next_image_pods.rb) explains both.
The helper is harmless under `use_frameworks!`, and the example app in
[`example/ios/Podfile`](./example/ios/Podfile) is built with it on every commit.

### Android

Nothing to configure. Autolinking picks up the module, and Coil 3, OkHttp and
the Kotlin coroutines runtime come in as transitive dependencies.

---

## Usage

```tsx
import NextImage from 'react-native-next-image';

<NextImage
  source={{
    uri: 'https://example.com/image.jpg',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
    priority: 'high',
    cache: 'immutable',
    cacheDuration: 60, // minutes
  }}
  placeholder={require('./placeholder.png')}
  defaultSource={require('./fallback.png')}
  prefetchThreshold={4}
  transition="fade"
  borderRadius={20}
  style={{ width: '100%', height: 300 }}
  onLoad={(event) => {
    // 'memory' or 'disk' means no network request was made.
    console.log(event.nativeEvent.cacheType, event.nativeEvent.elapsed, 'ms');
  }}
/>;
```

`source`, `placeholder` and `defaultSource` all accept a bundled asset from
`require()` as well as a URL. Bundled assets work in development (served by
Metro) and in release builds (read from the app bundle), and they skip the URL
policy because they never came from user input.

---

## How the cache works

Two tiers, shared by every `NextImage` in the app and by the preload APIs.

| Tier | Android | iOS | Default budget |
| :--- | :--- | :--- | :--- |
| Memory | Coil `MemoryCache` | Kingfisher `MemoryStorage` | 25% of the app's heap on Android, 25% of physical memory on iOS |
| Disk | Coil `DiskCache` (LRU) | Kingfisher `DiskStorage` (LRU) | 250 MB on both |

Set `memoryCacheBytes` in `NextImage.configure` to replace the platform default
with a fixed budget.

Every request is resolved in this order, and stops at the first hit:

1. **Memory.** Renders with no I/O.
2. **Disk.** Renders with no network connection, including offline and after a
   restart.
3. **Network.** Only reached when the entry is missing or its lifetime expired.

The downloaded bytes are always kept under the image's own key, next to any
resized, blurred or grayscale rendering, so a changed view size or effect is
rebuilt from them instead of downloaded again. `removeFromCache` removes the
bytes and every rendering made from them.

### Server cache headers are ignored by default

This is the part that makes "fetch once" true in practice. A lot of servers and
CDNs send `no-store`, `no-cache` or a short `max-age` on images, which would
force a download on every render.

- **Android** rewrites `Cache-Control` on the response to the lifetime you asked
  for before Coil stores it, and reads it back with Coil's header-aware cache
  strategy, so the entry expires after exactly `cacheDuration`. `ETag` and
  `Last-Modified` are kept, so revalidating after expiry can still answer `304`.
- **iOS** never consults cache headers: Kingfisher's own per-request expiration
  is what decides.

The memory tier follows the same lifetime on both platforms, so a short
`cacheDuration` is not defeated by a memory hit within the session.

Set `respectServerCacheHeaders: true` in `NextImage.configure` to give the
server back that control, or use `cache: 'web'` for a single image.

### Lifetime

`source.cacheDuration` is **in minutes** and defaults to 7 days. Decimals work,
so `0.5` is 30 seconds.

| `source.cache` | Behaviour |
| :--- | :--- |
| `'immutable'` *(default)* | Cache and never re-validate. With no `cacheDuration` the entry never expires. |
| `'web'` | Honour the server's cache headers. On iOS this falls back to a 7 day lifetime, because Kingfisher manages expiry itself. |
| `'cacheOnly'` | Never touch the network. Fails with code `CACHE_MISS` when the entry is missing or expired. |
| `'reload'` | Skip the cache for this request and replace the stored entry. An explicit refresh outranks `prefetchThreshold`, so it downloads even while the image is off screen. |

### Cache keys and signed URLs

The cache key is the URL. If your URLs carry a rotating signature or an expiry
parameter, every render produces a new key and nothing is ever reused. Pass a
stable `cacheKey` instead:

```tsx
<NextImage
  source={{
    uri: `https://cdn.example.com/a.jpg?X-Amz-Signature=${signature}`,
    cacheKey: 'avatar-42',
  }}
/>
```

> [!NOTE]
> A cache key is app-wide and does not include your headers, so an image
> authorised for one user can be served from cache to another. If your app
> switches accounts, put the account in the `cacheKey` or clear the cache on
> sign-out.

---

## `prefetchThreshold`, and what "400%" means

`prefetchThreshold` is a multiple of the **screen size**. It sets how far
outside the viewport an image may be and still be allowed to download.

At `prefetchThreshold={4}` on an 800pt tall screen, the window an image is
tested against is:

```
         -3200pt  ──┬──  4 screens above the viewport
                    │
             0pt  ──┼──  top of the screen
                    │    the visible viewport
           800pt  ──┼──  bottom of the screen
                    │
          4000pt  ──┴──  4 screens below the viewport
```

An image whose frame intersects that window starts downloading. An image outside
it waits. The same rule is applied horizontally for carousels.

| Value | Meaning |
| :--- | :--- |
| `0` | Only download once the image is actually on screen. |
| `1` | 100%: one screen above and below. |
| `4` *(default)* | 400%: four screens above and below. |
| `Infinity` | No gating; every mounted image downloads immediately. |

Three details that matter:

- **A cached image ignores the threshold completely.** The native view is
  mounted right away and reads memory and disk no matter where it is; the
  threshold only gates the network. Scrolling through a list you have seen
  before makes no requests at all.
- **A deferred image never opens a connection.** On Android, Coil expresses
  "no network" as an `only-if-cached` request header and relies on an HTTP
  cache to refuse it; `NextImage` answers that refusal itself, so nothing goes
  out. On iOS the request is cache-only by construction.
- **One shared tracker measures every pending image**, and it stops running as
  soon as nothing is waiting. Nothing polls in the background for images that
  have already loaded. Bundled assets are never gated.

You can change how often pending images are re-measured (250 ms by default):

```tsx
import { setViewportPollInterval } from 'react-native-next-image';

setViewportPollInterval(500);
```

---

## Security

Defaults are strict, and every rule is enforced twice: in JS before the request
is created, and again in Kotlin and Swift for anything that reaches native
directly. `placeholder` and `defaultSource` URLs go through the same policy as
`source`.

| Default | Rule |
| :--- | :--- |
| `https` only | `http://` is refused unless you opt in, so tokens cannot travel in clear text. On Android a release build does not even offer the cleartext connection spec to OkHttp. |
| No `data:` or `file:` | Both are opt-in. `data:` is also size capped. |
| No credentials in URLs | `https://user:pass@host/…` is refused. |
| Private networks blocked | Loopback, link-local, RFC 1918, CGNAT, multicast, `*.local`, `*.internal` and `169.254.169.254` are refused, so a server-supplied URL cannot turn the app into an SSRF proxy. |
| Headers sanitised | CR, LF and other control characters are rejected (request splitting), as are `Host`, `Content-Length`, `Transfer-Encoding` and the other hop-by-hop headers. Names must be RFC 7230 tokens. Counts and lengths are capped. |
| No HTTPS to HTTP redirects | A redirect that would downgrade the connection is refused instead of leaking your `Authorization` header, by OkHttp on Android and by a redirect handler on iOS. Allowed only when you opt into plain http. |
| Secrets never logged | `Authorization`, `Cookie`, `X-Api-Key` and friends are replaced with `***`; URLs are logged without their query string. |

Nothing is silently escaped. An unsafe URL is refused and surfaced through
`onError` with a machine readable `code` and the URL itself minus its query
string; an unsafe header is dropped and the rest of the request continues. A
rejected `placeholder` or `defaultSource` is dropped with a warning in
development, because a broken placeholder is not a load failure.

Bundled assets are the one exception to the URL policy: `require()` resolves to
a Metro URL in development and to the app bundle in release, neither of which
came from user input.

### Certificate pinning

Opt-in, and identical on both platforms. Pins are SPKI SHA-256 digests in the
same `sha256/<base64>` format OkHttp and `openssl` use:

```bash
openssl s_client -connect cdn.example.com:443 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

```tsx
NextImage.configure({
  certificatePins: {
    'cdn.example.com': ['sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  },
});
```

A host with pins configured **fails closed**: system trust must pass *and* a
pin must match, otherwise the connection is refused. A malformed pin is rejected
by `configure` rather than quietly weakening TLS. RSA 2048/4096 and EC
P-256/P-384 keys are supported on iOS.

---

## API

### Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `Source \| number` | – | Image source, or a `require()`d asset. |
| `defaultSource` | `number \| string` | – | Shown when `source` fails. A `require()`d asset or a URL. |
| `placeholder` | `number \| string` | – | Shown while `source` loads. A `require()`d asset or a URL. |
| `resizeMode` | `'contain' \| 'cover' \| 'stretch' \| 'center'` | `'cover'` | |
| `transition` | `'none' \| 'fade' \| 'slide' \| 'scale' \| 'gravity'` | `'none'` | |
| `transitionDuration` | `number` | `300` | Milliseconds, capped at 10000. |
| `prefetchThreshold` | `number` | `4` | Viewport threshold, as a multiple of the screen size. |
| `borderRadius` | `number` | `0` | Rounds the image and its container. `style.borderRadius` works too. |
| `isCircle` | `boolean` | `false` | Circular crop of the image and its container. |
| `grayscale` | `boolean` | `false` | Native grayscale. |
| `blurRadius` | `number` | `0` | Native blur, capped at 100. |
| `tintColor` | `ColorValue` | – | Tints the image as a template. |
| `downsample` | `boolean` | `true` | Decode at the view's size instead of the image's. |
| `retryCount` | `number` | `2` | Attempts after the first failure, capped at 10. |
| `retryDelay` | `number` | `1000` | Milliseconds before the first retry, doubling per attempt, never waiting more than 60s. |
| `style` | `StyleProp<ImageStyle>` | – | Applied to the container; the image fills it. |
| `children` | `ReactNode` | – | Rendered on top of the image, for badges and overlays. |

All `View` props (`testID`, accessibility props, `onLayout`) are supported and
forwarded to the container.

### `Source`

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uri` | `string` | – | **Required.** |
| `headers` | `Record<string, string>` | `{}` | Sanitised before use. |
| `priority` | `'low' \| 'normal' \| 'high'` | `'normal'` | On Android `low` runs on a two-thread lane so it cannot starve visible images; on iOS it maps to the URLSession task priority. |
| `cache` | `'immutable' \| 'web' \| 'cacheOnly' \| 'reload'` | `'immutable'` | See [Lifetime](#lifetime). |
| `cacheDuration` | `number` | `10080` | Minutes. |
| `cacheKey` | `string` | the `uri` | Stable key for signed URLs. |

### Events

| Event | Payload |
| :--- | :--- |
| `onLoadStart` | – |
| `onProgress` | `{ loaded, total }` |
| `onLoad` | `{ width, height, cacheType, elapsed }` |
| `onError` | `{ error, code, status, retryable }` |
| `onLoadEnd` | – |

`width` and `height` are the decoded bitmap's size in pixels. With `downsample`
on (the default) that is the view's size, not the file's; set
`downsample={false}` to get the file's dimensions. `cacheType` is `'memory'`,
`'disk'`, `'network'` or `'unknown'`; the first two
mean no network request was made, and a bundled asset or `file:` source
reports `'disk'`. `elapsed` is milliseconds from the start of the attempt that
succeeded to display. In `onProgress`, `total` is `0` when the server sends no
`Content-Length`.

`onLoadStart` fires once per source: not once per native retry, and not again
when an image that waited for `prefetchThreshold` starts its download. `onLoad` fires
only for `source`; a `defaultSource` shown after a failure is reported through
`onError` alone.

`code` is one of `HTTP_CLIENT`, `HTTP_SERVER`, `NETWORK`, `DECODE`,
`CACHE_MISS`, `UNKNOWN`, or a security code such as `INSECURE_SCHEME`,
`HOST_NOT_ALLOWED` or `PRIVATE_HOST_BLOCKED`. `onError` fires once, after
retries are exhausted; `retryable` says whether a manual retry could still
succeed. Once a source has failed for good the view shows `defaultSource`, or
nothing.

### Static methods

```tsx
NextImage.configure(config);            // security and cache settings
NextImage.getConfig();                  // the active security config

NextImage.preload(sources);             // warm the cache, with headers and TTL; accepts require()d assets too
NextImage.prefetch(uris, priority);     // warm the cache, resolves when done with the number now cached

NextImage.isCached(uri, cacheKey?);     // would this render without the network?
NextImage.removeFromCache(uri, cacheKey?);
NextImage.clearMemoryCache();
NextImage.clearDiskCache();

NextImage.getDiskCacheSize();           // bytes
NextImage.getMemoryCacheSize();         // bytes
NextImage.setCacheLimits({ memoryBytes, diskBytes });
```

Blocked URLs are filtered out of `preload` and `prefetch` rather than sent to
native. Preloading writes to disk and leaves the memory cache alone, so warming
a long list cannot evict the images that are on screen; on Android it also
bounds the decode size while doing so. A prefetched entry gets the same
lifetime a plain `{ uri }` source gets: it never expires.

### Web

On react-native-web there is no native view, so `NextImage` renders the
platform `<Image>`: `source` (including `require()`d assets), `resizeMode`,
`blurRadius`, `style`, `children` and the load events work, the browser cache
does the caching, and the static cache methods resolve to `0`, `false` or
nothing. `placeholder`, `defaultSource`, transitions, tinting and grayscale are
ignored there. `isNativeViewAvailable` tells you which mode you are in.

### Other exports

```tsx
import {
  isNativeViewAvailable, // false on web, where the platform image is used
  isNearViewport,        // the prefetchThreshold test, for your own lists
  setViewportPollInterval,
  redactUri,             // the same redaction NextImage applies to its own errors
  redactHeaders,
} from 'react-native-next-image';
```

### `NextImage.configure`

```tsx
NextImage.configure({
  // Security
  allowInsecureHttp: false,
  allowDataUri: false,
  allowFileUri: false,
  allowedHosts: null,            // e.g. ['*.cdn.example.com']
  blockedHosts: [],
  blockPrivateNetworks: true,
  allowUriCredentials: false,
  maxUriLength: 8192,
  maxDataUriBytes: 2 * 1024 * 1024,
  maxHeaderCount: 24,
  maxHeaderNameLength: 128,
  maxHeaderValueLength: 8192,
  certificatePins: {},

  // Cache and transport
  memoryCacheBytes: 0,           // 0 keeps the per-platform default
  diskCacheBytes: 250 * 1024 * 1024,
  requestTimeoutMs: 30000,
  respectServerCacheHeaders: false,
});
```

Host patterns accept `example.com`, `.example.com`, `*.example.com` and `*`.
Call `configure` during startup. Changing a cache size or a transport setting
rebuilds the Android loader; a view whose request was in flight re-enqueues it
on the new loader, so nothing is lost, but the memory cache starts empty.

---

## Platform notes

| Feature | Android | iOS |
| :--- | :--- | :--- |
| Engine | Coil 3 + OkHttp 4 | Kingfisher 8 |
| Download progress | Response body wrapping, throttled to 50 ms | Kingfisher progress block |
| `cache: 'web'` | Honours server cache headers | Falls back to a 7 day lifetime |
| `data:` and `file:` sources | Coil fetchers | Kingfisher data providers; the bytes are not copied into the disk cache |
| Cache tiers per image | Bytes on disk, one decoded bitmap per size in memory | Bytes plus each rendering on disk and in memory |
| Bundled assets in release | Drawable resource lookup | `file://` inside the app bundle |
| Blur | `RenderEffect` on API 31+, a cached downscale below | `BlurImageProcessor` |
| Grayscale | `ColorMatrix` on the view | `BlackWhiteProcessor` |
| `grayscale` with `tintColor` | Grayscale wins; one colour filter per view | Both apply |
| Corner radius, circle | Coil transformations, plus the container | View layer, plus the container |
| Memory cache reporting | Coil cache size | Kingfisher cache cost |

---

## Performance notes

- **One request per prop update.** Props arrive one at a time; both platforms
  wait until the whole update is applied, so changing eight props starts one
  request, not eight.
- **Nothing reloads when nothing changed.** A view keeps what it is showing
  unless the request or the rendered bitmap would actually differ.
- **Nothing blanks while loading.** The previous image or the placeholder stays
  on screen until the new image is ready; a deferred cache miss leaves the
  placeholder alone.
- **Which props are free to change** differs by platform, because each engine
  does part of the work on the view and part during decode:

  | Changing this | Android | iOS |
  | :--- | :--- | :--- |
  | `grayscale` | free | re-decodes |
  | `tintColor` | free | free, unless you switch it on or off |
  | `blurRadius` | free on API 31+, re-decodes below | re-decodes |
  | `borderRadius`, `isCircle` | re-decodes | free |

  A re-decode still comes from cache, so it costs CPU rather than a request.
- **Downsampling** decodes at the view's size by default. On iOS the size is
  bucketed to 32pt so a one-point layout change does not invalidate the image,
  and only a view that grew re-decodes. `downsample={false}` decodes at full
  size on both platforms.
- **Clipped list rows** (`removeClippedSubviews`) keep their image and report
  no extra events when they come back on screen.
- **Recycled views** cancel their in-flight request and release their image.

---

## Example app

[`example/`](./example) is a React Native 0.85 app with one screen per feature:
a cached gallery with live memory/disk/network counters, transitions and resize
modes, effects, every cache API, error and security cases, bundled assets and
`data:` sources, download progress, and custom headers. All demo images come
from public hosts.

```bash
yarn
yarn example ios
yarn example android
yarn example web
```

---

## Testing

```bash
yarn test                        # 87 Jest tests: security, props, viewport, component
yarn typecheck
yarn lint

yarn test:ios                    # 89 assertions over the Swift URL, header and data uri handling
yarn test:android                # 43 JUnit tests: security, config, request parsing, cache headers, progress
```

Everything above runs on every push and pull request via
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml), together with builds of
the example app for Android, iOS and web.

---

## Roadmap to v1.0

- [x] New Architecture support on both platforms (Fabric view + Turbo Module)
- [x] Cache-first loading with a per-source lifetime
- [x] URL and header hardening, with certificate pinning
- [x] Bundled assets, placeholders and fallbacks that work in release builds
- [x] Unit tests for JS, Kotlin and Swift, running in CI
- [ ] Animated image support (GIF, WebP)
- [ ] Blurhash and thumbhash placeholders
- [ ] Instrumented tests on a device
- [ ] Documentation site

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) to
get started.

---

## License

[MIT](./LICENSE) © [I Plus T Solution](https://github.com/iplustsolution)
