<div align="center">

<img src="https://www.iplust.in/logo.png" alt="react-native-next-image logo" width="120" />

# react-native-next-image

**The Ultimate Pro-Grade Image Component for React Native.**

Ultra-fast, ultra-smooth, and engineered for high-performance applications. Powered by **Coil 3 (Android)** and **Kingfisher 8 (iOS)**.

[![npm version](https://img.shields.io/npm/v/react-native-next-image.svg?color=6366f1&label=npm)](https://www.npmjs.com/package/react-native-next-image)
[![npm downloads](https://img.shields.io/npm/dm/react-native-next-image.svg?color=6366f1)](https://www.npmjs.com/package/react-native-next-image)
[![platforms](https://img.shields.io/badge/platform-iOS%20%7C%20Android-6366f1.svg)](#)
[![license](https://img.shields.io/npm/l/react-native-next-image.svg?color=6366f1)](./LICENSE)

</div>

---

## 🚀 Version 0.0.4: The "Pro" Update with bug fix

We've completely overhauled the core engines to bring you the most advanced image loading library for React Native.

### ✨ Key Features

- 🏎️ **Dynamic Pre-fetching**: Images are automatically loaded in the background when they approach the viewport (Default: **400%** threshold, fully customizable).
- ⚡ **Coil 3 & Kingfisher 8**: Leveraging the latest native image engines for hardware-accelerated rendering.
- 🎨 **Pro Transitions**: Native spring animations including `fade`, `slide`, `scale`, and `gravity` (bouncy overshoot).
- 🛠️ **Native Processing**: High-performance native `borderRadius`, `isCircle`, and `grayscale` filtering.
- 🧠 **Smart Caching**: Shared global memory and disk cache (100MB+) across all instances.
- 🔑 **Custom Headers**: Pass Authorization tokens or any custom headers directly.
- ⏳ **Cache Expiration**: Fine-grained control over cache validity (minutes or seconds).

---

## 📦 Installation

```bash
# Using yarn
yarn add react-native-next-image

# Using npm
npm install react-native-next-image
```

### iOS Setup
```bash
cd ios && pod install
```

---

## 💡 Usage

### Pro Usage (Headers & Cache TTL)
```tsx
import NextImage from 'react-native-next-image';

<NextImage
  source={{
    uri: 'https://example.com/secure-image.jpg',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
    priority: 'high',
    cache: 'immutable',
    cacheDuration: 60, // Keep in cache for 60 minutes (1 hour)
  }}
  transition="gravity"
  borderRadius={20}
  style={{ width: '100%', height: 300 }}
/>
```

---

## 📖 API Reference

### Props

| Prop | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `source` | `Source` | **Yes** | - | The image source configuration. |
| `defaultSource` | `string` | No | - | Fallback image URL if the main source fails. |
| `resizeMode` | `ResizeMode` | No | `'cover'` | `'contain'`, `'cover'`, `'stretch'`, `'center'`. |
| `transition` | `Transition` | No | `'none'` | `'fade'`, `'slide'`, `'scale'`, `'gravity'`. |
| `transitionDuration` | `number` | No | `300` | Duration of the transition in milliseconds. |
| `borderRadius` | `number` | No | `0` | Native corner radius for performance. |
| `isCircle` | `boolean` | No | `false` | Crops the image to a native circle. |
| `grayscale` | `boolean` | No | `false` | Applies a native grayscale filter. |
| `blurRadius` | `number` | No | `0` | Applies a native blur effect. |
| `downsample` | `boolean` | No | `true` | Memory-optimized loading for large images. |
| `prefetchThreshold` | `number` | No | `4` | Pre-fetch distance as a multiple of screen size (e.g. `2` for 200%). |
| `tintColor` | `ColorValue` | No | - | Applies a tint color to non-transparent pixels. |

### Source Object

| Field | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `uri` | `string` | **Yes** | - | The URL of the image to load. |
| `headers` | `Object` | No | `{}` | HTTP headers (e.g. `{ Authorization: '...' }`). |
| `priority` | `Priority` | No | `'normal'` | `'low'`, `'normal'`, `'high'`. |
| `cache` | `Cache` | No | `'web'` | `'immutable'`, `'web'`, `'cacheOnly'`. |
| `cacheDuration` | `number` | No | `10080` | Cache TTL in **minutes**. (e.g. `0.5` for 30s). |

### Static Methods

| Method | Description |
| :--- | :--- |
| `NextImage.preload(sources[])` | Pre-fetches images into the native cache. |
| `NextImage.clearMemoryCache()` | Clears the global memory cache. |
| `NextImage.clearDiskCache()` | Clears the global disk cache. |

---

## 🧠 Advanced: Dynamic Pre-fetching

`react-native-next-image` uses a predictive threshold mechanism. By default, it uses a **400% threshold** (`prefetchThreshold={4}`).

It monitors the image's position relative to the viewport. If the image is within the specified distance, the native engine immediately starts fetching and decoding.

- Set `prefetchThreshold={1}` to load only when the image is 1 screen away.
- Set `prefetchThreshold={8}` for ultra-aggressive loading in fast-scrolling lists.

---

## 📜 License

[MIT](./LICENSE) © [I Plus T Solution](https://github.com/iplustsolution)
