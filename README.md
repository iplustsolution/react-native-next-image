<div align="center">

<img src="https://www.iplust.in/logo.png" alt="react-native-next-image logo" width="120" />

# react-native-next-image

**Blazing-fast, next-gen image loading for React Native.**

Built for speed. Designed for scale. Made for developers who refuse to compromise on performance.

[![npm version](https://img.shields.io/npm/v/@iplustsolution/react-native-next-image.svg?color=6366f1&label=npm)](https://www.npmjs.com/package/@iplustsolution/react-native-next-image)
[![npm downloads](https://img.shields.io/npm/dm/@iplustsolution/react-native-next-image.svg?color=6366f1)](https://www.npmjs.com/package/@iplustsolution/react-native-next-image)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@iplustsolution/react-native-next-image?color=6366f1)](https://bundlephobia.com/package/@iplustsolution/react-native-next-image)
[![types](https://img.shields.io/npm/types/@iplustsolution/react-native-next-image.svg?color=6366f1)](https://www.npmjs.com/package/@iplustsolution/react-native-next-image)
[![license](https://img.shields.io/npm/l/@iplustsolution/react-native-next-image.svg?color=6366f1)](./LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-6366f1.svg)](./CONTRIBUTING.md)
[![platforms](https://img.shields.io/badge/platform-iOS%20%7C%20Android-6366f1.svg)](#)

[Documentation](#) · [Report a Bug](https://github.com/iplustsolution/react-native-next-image/issues) · [Request a Feature](https://github.com/iplustsolution/react-native-next-image/issues)

</div>

---

## 🚧 Status

> **`react-native-next-image` is currently under active development.**
> The API surface, native implementation, and public exports are evolving quickly and may change without notice until a `1.0.0` release. Star and watch the repo to follow progress — installation and usage docs will land here as soon as the API stabilizes.

---

## ✨ Why react-native-next-image?

Image loading is one of the most performance-critical, most poorly-solved problems in React Native apps. Existing solutions are often slow to adopt new native rendering pipelines, carry outdated dependencies, or force trade-offs between speed, memory usage, and developer experience.

**react-native-next-image** is being built from the ground up to change that — a modern, native-first image component engineered specifically around how React Native apps actually render, scroll, and recycle views today.

- ⚡ **Speed-first architecture** — built on native image pipelines rather than bridging legacy web-view image loading.
- 🧠 **Smart by default** — sensible caching, decoding, and memory behavior out of the box, no configuration required to get fast results.
- 🧩 **New Architecture native** — built as a Turbo Module from day one, not retrofitted onto the old bridge.
- 📦 **Tiny footprint** — no bloated dependency tree, no unnecessary abstractions.
- 🍎🤖 **True cross-platform parity** — first-class iOS and Android implementations, not a shared lowest-common-denominator layer.
- 🛠️ **Built with TypeScript** — fully typed from the native layer up.

---

## 🧬 The Philosophy

Most image libraries were designed for a React Native that no longer exists — the old bridge, JSI-less, single-threaded rendering model. `react-native-next-image` starts from today's architecture:

```
        Legacy approach                    react-native-next-image
   ┌──────────────────────┐          ┌──────────────────────────┐
   │   JS Bridge (async)   │          │   JSI / Turbo Modules     │
   │   Serialized props    │   ───▶   │   Direct native calls      │
   │   Bridge-bound decode │          │   Native-thread decoding   │
   └──────────────────────┘          └──────────────────────────┘
```

The goal isn't to be "another image component" — it's to be the image component that feels like it was shipped by the platform itself.

---

## 🏗️ Built With

<p>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Objective--C-438EFF?style=flat-square&logo=apple&logoColor=white" alt="Objective-C" />
  <img src="https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/Turbo_Modules-000000?style=flat-square" alt="Turbo Modules" />
</p>

- **Kotlin** for the Android native module
- **Objective-C / Objective-C++** for the iOS native module
- **TypeScript** for the JS/public API layer
- **[react-native-builder-bob](https://github.com/callstack/react-native-builder-bob)** for library packaging
- **Turbo Modules / Codegen** for the New Architecture bridge

---

## 🗺️ Roadmap to v1.0

- [x] Turbo Module scaffolding (iOS + Android)
- [x] TypeScript type definitions
- [ ] Native image decoding pipeline
- [ ] Memory + disk caching strategy
- [ ] Placeholder / blur-up loading states
- [ ] Priority-based loading & prefetching
- [ ] Public API stabilization
- [ ] Documentation site
- [ ] `1.0.0` release

Follow along in the [Issues](https://github.com/iplustsolution/react-native-next-image/issues) and [Projects](https://github.com/iplustsolution/react-native-next-image) tabs.

---

## 🤝 Contributing

This library is in its early, most exciting phase — architectural decisions, API design, and core direction are still being shaped. If you're interested in high-performance native modules, image pipelines, or React Native internals, this is a great time to get involved.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) to get started.

---

## 📜 License

[MIT](./LICENSE) © [I Plus T Solution](https://github.com/iplustsolution)

---

<div align="center">

**If this project interests you, consider starring the repo — it genuinely helps.**

⭐ [Star on GitHub](https://github.com/iplustsolution/react-native-next-image) · 📦 [View on npm](https://www.npmjs.com/package/@iplustsolution/react-native-next-image)

</div>