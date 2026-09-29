# Changelog

From 0.0.8 on, release notes are generated for each [GitHub release](https://github.com/iplustsolution/react-native-next-image/releases).

## 0.0.7

**Added**

- `nativeComponent` and `nativeViewProps`, and the `NextImageNativeView`
  export, so an app can render the native view through its own wrapper, for
  example to put a Reanimated `sharedTransitionTag` on the image itself. See
  [Shared element transitions](#shared-element-transitions). Nothing changes
  when they are not used.

**Fixed**

- iOS: the load is now committed in `finalizeUpdates`, after the layout
  metrics, instead of at the end of `updateProps`. A recycled view no longer
  starts a request sized for the component it was recycled from, and a new
  view (including the copy a shared element transition mounts) shows a memory
  cache hit in its first frame.
- iOS: cancelling a load now invalidates a result Kingfisher had already
  queued. Previously a recycled view could briefly show, and report through
  `onLoad`, the previous owner's image or placeholder.
- iOS: `cover` and `stretch` images are decoded large enough to cover the view.
  Kingfisher's downsampler bounds only the longest side, so a photo whose
  aspect ratio differed from the view's was decoded too small and looked soft.
- iOS: a host matched by several `certificatePins` patterns accepts a pin from
  any of them, as on Android. It used to pick one pattern in dictionary order.
- Android: `.example.com` and `*.example.com` pin hosts are translated for
  OkHttp. `.example.com` made building the HTTP client throw, and
  `*.example.com` did not cover the domain itself or deeper subdomains as it
  does on iOS. `configure` now rejects pin hosts neither platform can apply,
  such as `*`.
- Android: a retry waiting for its backoff is no longer dropped when the view
  is detached (a clipped list row, a covered screen); the image used to stay
  on its placeholder for good.
- Both: `slide`, `scale` and `gravity` no longer animate a memory cache hit,
  matching `fade`, and a recycled or dropped view stops any running
  transition animation.
