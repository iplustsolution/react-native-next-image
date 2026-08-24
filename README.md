<div align="center">

<img src="https://www.iplust.in/logo.png" alt="react-native-next-image logo" width="120" />

# react-native-next-image

**Advanced, high-performance image loading for React Native.**

Built for speed. Optimized for the New Architecture. Powered by **Coil 3 (Android)** and **SDWebImage (iOS)**.

[![npm version](https://img.shields.io/npm/v/react-native-next-image.svg?color=6366f1&label=npm)](https://www.npmjs.com/package/react-native-next-image)
[![npm downloads](https://img.shields.io/npm/dm/react-native-next-image.svg?color=6366f1)](https://www.npmjs.com/package/react-native-next-image)
[![platforms](https://img.shields.io/badge/platform-iOS%20%7C%20Android-6366f1.svg)](#)
[![license](https://img.shields.io/npm/l/react-native-next-image.svg?color=6366f1)](./LICENSE)

</div>

---

## ⚠️ 🚧 Status: Alpha Development

> [!CAUTION]
> **This package is NOT yet production-ready.**
> `react-native-next-image` is currently in an active **Development and Testing phase**. We are rapidly iterating on the API, resolving native crashes, and fixing significant bugs.
>
> **Our Recommendation:** Do not use this package in production environments until we reach version **`1.0.0`**. Use it for experimentation and testing only.

---

## ✨ Key Features (Under Development)

- 🏎️ **Dynamic Pre-fetching**: Background image loading based on proximity to the viewport (Customizable threshold).
- ⚡ **Modern Native Engines**:
  - **Android**: Powered by the latest [Coil 3](https://coil-kt.github.io/coil/) (Kotlin First, Coroutine based).
  - **iOS**: Powered by [SDWebImage](https://github.com/SDWebImage/SDWebImage) (The gold standard for iOS image loading).
- 🎨 **Native Transitions**: Support for `fade`, `slide`, `scale`, and bouncy `gravity` animations.
- 🛠️ **Native Processing**: High-performance `borderRadius`, `isCircle`, and `grayscale` filters handled at the engine level.
- 🧠 **Smart Caching**: Configurable TTL (Time-To-Live) and custom HTTP headers support.

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

```tsx
import NextImage from 'react-native-next-image';

<NextImage
  source={{
    uri: 'https://example.com/image.jpg',
    headers: { Authorization: 'Bearer YOUR_TOKEN' },
    priority: 'high',
    cache: 'immutable',
    cacheDuration: 60, // 60 minutes
  }}
  prefetchThreshold={4}  // Load when within 400% of screen height
  transition="gravity"
  borderRadius={20}
  style={{ width: '100%', height: 300 }}
/>
```

---

## 📖 API Reference

### Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `Source` | - | **Required.** Image source configuration. |
| `defaultSource` | `string` | - | Fallback image URL. |
| `resizeMode` | `ResizeMode` | `'cover'` | `'contain'`, `'cover'`, `'stretch'`, `'center'`. |
| `transition` | `Transition` | `'none'` | `'fade'`, `'slide'`, `'scale'`, `'gravity'`. |
| `transitionDuration` | `number` | `300` | Transition duration in milliseconds. |
| `prefetchThreshold` | `number` | `4` | Viewport threshold (multiple of screen size). |
| `borderRadius` | `number` | `0` | Native corner radius. |
| `isCircle` | `boolean` | `false` | Native circular crop. |
| `grayscale` | `boolean` | `false` | Native grayscale filter. |
| `downsample` | `boolean` | `true` | Memory-optimized loading. |

### Source Object

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `uri` | `string` | - | **Required.** Image URL. |
| `headers` | `Object` | `{}` | HTTP Headers. |
| `cacheDuration` | `number` | `10080` | Cache TTL in **minutes**. |

---

## 🗺️ Roadmap to v1.0

- [ ] Stabilize Native API Parity (Coil 3 vs SDWebImage)
- [ ] Resolve memory leaks in large lists
- [ ] Implement robust error handling and retry logic
- [ ] Complete Test Suite (Unit + Integration)
- [ ] Detailed Documentation Site
- [x] **v1.0.0 Production Release**

---

## 🤝 Contributing

Contributions are welcome! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

---

## 📜 License

[MIT](./LICENSE) © [I Plus T Solution](https://github.com/iplustsolution)
