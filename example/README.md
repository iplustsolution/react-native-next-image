# NextImage example app

A React Native 0.85 app (New Architecture) with one screen per feature of
`react-native-next-image`. Every screen shows where each image came from
(`memory`, `disk` or `network`) and how long it took, so each behaviour can be
verified on a device rather than taken on trust. All demo images come from
public hosts: `picsum.photos`, `dummyimage.com` and `httpbin.org`.

## Run it

From the repository root:

```sh
yarn                 # installs the workspace, including the example
yarn example start   # Metro

yarn example ios     # pod install runs automatically the first time
yarn example android
yarn example web     # react-native-web via vite
```

The iOS Podfile uses `next_image_post_install` from
[`scripts/next_image_pods.rb`](../scripts/next_image_pods.rb), which is what an
app installing the package from npm adds too.

## Screens

| Tab | What to check |
| :--- | :--- |
| **Gallery** | A cached list. Scroll it once, then remount or restart the app: rows report `memory` or `disk`, never `network`. Prefetch and preload the rest, watch the disk size grow, clear each tier. |
| **Transitions** | `none`, `fade`, `slide`, `scale` and `gravity`, replayable, plus the four `resizeMode` values on one image. |
| **Effects** | `borderRadius`, `isCircle`, `grayscale`, `blurRadius`, `tintColor` and `downsample`, applied live. The container is rounded with the image. |
| **Cache** | A signed URL with a stable `cacheKey`, a 15 second `cacheDuration`, `cacheOnly`, `reload`, `web`, and every static cache API with its result. |
| **Errors** | A 404, an unreachable host retried with backoff, and three URLs the security policy refuses before any request. Each falls back to `defaultSource`. |
| **Local** | A `require()`d asset as the source, as a placeholder and as a fallback, a remote placeholder, and an inline `data:` image. |
| **Progress** | Download progress on a large image, the `onLoadStart`, `onLoad`, `onLoadEnd` order, and `priority` low against high. |
| **Headers** | Custom request headers, headers the sanitiser drops, and the redaction applied to logs. |

## Layout

```
src/
  App.tsx          tab strip and screen switch
  theme.ts         colours, spacing, shared styles
  urls.ts          the demo URLs
  assets/          bundled PNGs and the inline data uri
  components/      Screen, Section, Button, Badge, EventLog, Stat
  screens/         one file per tab
```
