package com.nextimage

import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.PorterDuff
import android.graphics.RenderEffect
import android.graphics.Shader
import android.os.Build
import android.view.animation.Animation
import android.view.animation.OvershootInterpolator
import android.view.animation.ScaleAnimation
import android.view.animation.TranslateAnimation
import android.widget.ImageView
import coil3.Image
import coil3.ImageLoader
import coil3.asDrawable
import coil3.decode.DataSource
import coil3.network.HttpException
import coil3.request.Disposable
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.crossfade
import coil3.request.target
import coil3.request.transformations
import coil3.size.Precision
import coil3.size.Scale
import coil3.size.Size
import coil3.size.ViewSizeResolver
import coil3.target.ImageViewTarget
import coil3.transform.CircleCropTransformation
import coil3.transform.RoundedCornersTransformation
import coil3.transform.Transformation
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.UIManagerHelper
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * The native image view.
 *
 * Loading rules, in order:
 *  1. Props arrive one at a time, so nothing loads until the view manager
 *     signals the end of the update transaction. One prop change is one
 *     request, not eight.
 *  2. Memory and disk are always read first. A cached image appears without a
 *     network connection even while the image is far outside the viewport.
 *  3. `deferNetwork` (set by the JS `prefetchThreshold` tracker) restricts a
 *     request to the caches. A miss is silent, because a deferred image that is
 *     not cached yet has not failed.
 *  4. A network failure is retried with exponential backoff; a 4xx is not,
 *     because retrying a rejected request cannot succeed.
 *  5. The view never blanks itself while a request is running: the placeholder
 *     or the previous image stays until the new one is ready.
 */
class NextImageView(context: ReactContext) : ImageView(context) {

  private var source: ReadableMap? = null
  private var defaultSource: ReadableMap? = null
  private var placeholderSource: ReadableMap? = null
  private var resizeModeValue: String = RESIZE_COVER
  private var transitionValue: String = TRANSITION_NONE
  private var transitionDurationMs: Int = 300
  private var borderRadiusPx: Float = 0f
  private var circleCrop: Boolean = false
  private var downsampleEnabled: Boolean = true
  private var grayscaleEnabled: Boolean = false
  private var blurRadiusValue: Int = 0
  private var tintColorValue: Int? = null
  private var deferNetwork: Boolean = false
  private var retryCount: Int = 2
  private var retryDelayMs: Int = 1000

  private var propsDirty = false
  private var disposable: Disposable? = null
  private var placeholderDisposable: Disposable? = null
  private var loadedSignature: String? = null
  private var pendingSignature: String? = null
  private var attempt = 0
  private var requestStartedAtMs = 0L
  private var mainImageLoaded = false
  private var progressUrl: String? = null
  private var progressListener: NextImageProgressRegistry.Listener? = null
  private var retryRunnable: Runnable? = null

  /**
   * Coil's stock target clears the view when a request starts and again when
   * it fails. That would flash the placeholder away on every deferred cache
   * miss and blank a loaded image while a changed prop re-decodes it. Nothing
   * is cleared here; the view decides for itself what to show.
   */
  private val target = object : ImageViewTarget(this) {
    override fun onStart(placeholder: Image?) {
      if (placeholder != null) super.onStart(placeholder)
    }

    override fun onError(error: Image?) {
      if (error != null) super.onError(error)
    }
  }

  init {
    scaleType = ScaleType.CENTER_CROP
  }

  fun setSource(value: ReadableMap?) {
    source = value
    propsDirty = true
  }

  fun setDefaultSource(value: ReadableMap?) {
    defaultSource = value
    propsDirty = true
  }

  fun setPlaceholder(value: ReadableMap?) {
    placeholderSource = value
    propsDirty = true
  }

  fun setResizeMode(value: String?) {
    resizeModeValue = value ?: RESIZE_COVER
    propsDirty = true
  }

  fun setTransition(value: String?) {
    transitionValue = value ?: TRANSITION_NONE
    propsDirty = true
  }

  fun setTransitionDuration(value: Int) {
    transitionDurationMs = value.coerceIn(0, 10_000)
  }

  fun setBorderRadiusDp(value: Float) {
    val px = if (value.isFinite() && value > 0f) PixelUtil.toPixelFromDIP(value) else 0f
    if (px != borderRadiusPx) {
      borderRadiusPx = px
      propsDirty = true
    }
  }

  fun setCircleCrop(value: Boolean) {
    circleCrop = value
    propsDirty = true
  }

  fun setDownsample(value: Boolean) {
    downsampleEnabled = value
    propsDirty = true
  }

  fun setGrayscale(value: Boolean) {
    grayscaleEnabled = value
    propsDirty = true
  }

  fun setBlurRadius(value: Int) {
    blurRadiusValue = value.coerceIn(0, 100)
    propsDirty = true
  }

  fun setTintColorValue(value: Int?) {
    tintColorValue = value
    propsDirty = true
  }

  fun setDeferNetwork(value: Boolean) {
    if (deferNetwork != value) {
      deferNetwork = value
      propsDirty = true
    }
  }

  fun setRetryCount(value: Int) {
    retryCount = value.coerceIn(0, 10)
  }

  fun setRetryDelay(value: Int) {
    retryDelayMs = value.coerceIn(0, 60_000)
  }

  /**
   * Called once per update transaction, after every prop has been set.
   * Reloading here instead of in each setter collapses a full prop update into
   * a single request.
   */
  fun commitProps() {
    if (!propsDirty) return
    propsDirty = false

    applyScaleType()
    applyFilters()

    when (val parsed = NextImageRequestFactory.parse(source, NextImageConfigStore.current)) {
      is NextImageRequestFactory.Parsed.Empty -> {
        clearRequest()
        loadedSignature = null
        mainImageLoaded = false
        showDefaultSource()
      }
      is NextImageRequestFactory.Parsed.Blocked -> {
        clearRequest()
        loadedSignature = null
        mainImageLoaded = false
        showDefaultSource()
        // The uri is redacted: an error payload must not carry a signed query
        // string or a token.
        val rawUri = if (source?.hasKey("uri") == true) source?.getString("uri") else null
        val described = if (rawUri == null) {
          parsed.message
        } else {
          "${parsed.message} (${NextImageSecurity.redactUri(rawUri)})"
        }
        emitError(described, parsed.code, 0, retryable = false)
        emitEvent(NextImageEvent.LOAD_END, null)
      }
      is NextImageRequestFactory.Parsed.Ok -> {
        val signature = signatureOf(parsed.spec)
        val pendingKey = "$signature|defer=$deferNetwork"
        // Already showing exactly this image.
        if (signature == loadedSignature && mainImageLoaded) {
          return
        }
        // The same request is already in flight under the same network policy.
        if (pendingKey == pendingSignature && disposable?.isDisposed == false) {
          return
        }
        attempt = 0
        load(parsed.spec, signature, pendingKey)
      }
    }
  }

  private fun load(
    spec: NextImageRequestFactory.Spec,
    signature: String,
    pendingKey: String,
  ) {
    clearRequest()
    pendingSignature = pendingKey
    requestStartedAtMs = System.currentTimeMillis()

    val loader = NextImageImageLoader.getLoader(context)
    if (!mainImageLoaded) {
      showPlaceholder(spec, loader)
    }

    val builder = ImageRequest.Builder(context)
    NextImageRequestFactory.apply(context, builder, spec, deferNetwork)
    builder.target(target)
    builder.scale(scaleFor(resizeModeValue))

    if (!downsampleEnabled) {
      builder.size(Size.ORIGINAL)
      builder.precision(Precision.INEXACT)
    }

    val transformations = mutableListOf<Transformation>()
    if (circleCrop) {
      transformations.add(CircleCropTransformation())
    } else if (borderRadiusPx > 0f) {
      transformations.add(RoundedCornersTransformation(borderRadiusPx))
    }
    if (blurRadiusValue > 0 && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      transformations.add(NextImageBlurTransformation(blurRadiusValue))
    }
    if (transformations.isNotEmpty()) {
      builder.transformations(transformations)
    }

    if (transitionValue == TRANSITION_FADE && transitionDurationMs > 0) {
      builder.crossfade(transitionDurationMs)
    }

    builder.listener(
      onStart = {
        // Coil restarts a request by itself when a clipped view comes back
        // into the window; that is not a new load as far as JS is concerned.
        if (!isShowing(signature)) {
          registerProgress(spec)
          // Once per load, not once per retry, matching iOS.
          if (attempt == 0) {
            emitEvent(NextImageEvent.LOAD_START, null)
          }
        }
      },
      onCancel = {
        unregisterProgress()
        handleCancel(spec, signature, pendingKey, loader)
      },
      onError = { _, result ->
        unregisterProgress()
        handleError(spec, signature, pendingKey, result.throwable)
      },
      onSuccess = { _, result ->
        unregisterProgress()
        handleSuccess(signature, result)
      },
    )

    disposable = loader.enqueue(builder.build())
  }

  private fun isShowing(signature: String): Boolean =
    mainImageLoaded && loadedSignature == signature

  private fun handleSuccess(signature: String, result: SuccessResult) {
    val duplicate = isShowing(signature)
    pendingSignature = null
    loadedSignature = signature
    mainImageLoaded = true
    attempt = 0
    placeholderDisposable?.dispose()
    placeholderDisposable = null
    applyFilters()
    if (!duplicate) {
      applyCustomTransition()
      emitSuccess(result)
    }
  }

  /**
   * Coil cancels a request when the view is clipped out of the window, and
   * restarts it when the view comes back; that needs no help. A cancellation
   * caused by the loader being rebuilt (`configure`, `setCacheLimits`) would
   * otherwise leave the view empty for good, so that one is re-enqueued.
   */
  private fun handleCancel(
    spec: NextImageRequestFactory.Spec,
    signature: String,
    pendingKey: String,
    loader: ImageLoader,
  ) {
    if (pendingSignature != pendingKey) return
    if (NextImageImageLoader.peekLoader() === loader) return
    post {
      if (pendingSignature == pendingKey) {
        load(spec, signature, pendingKey)
      }
    }
  }

  /**
   * A deferred request that misses the cache has not failed, so it stays
   * silent. Everything else is retried unless the server refused it or the
   * request was never allowed to reach the network.
   */
  private fun handleError(
    spec: NextImageRequestFactory.Spec,
    signature: String,
    pendingKey: String,
    throwable: Throwable,
  ) {
    pendingSignature = null

    if (deferNetwork) {
      return
    }

    val http = throwable as? HttpException
    val status = http?.response?.code ?: 0
    // The synthetic 504 from NextImageOnlyIfCachedInterceptor: the cache
    // missed and the network was off limits, or the device is offline.
    val unsatisfiable = http != null &&
      status == NextImageOnlyIfCachedInterceptor.UNSATISFIABLE_STATUS &&
      http.response.headers[UNSATISFIABLE_HEADER] != null
    val reportedStatus = if (unsatisfiable) 0 else status
    val clientError = status in 400..499
    // A cache-only request that missed cannot be fixed by trying again.
    val cacheOnly = spec.cache == NextImageRequestFactory.CACHE_ONLY
    val canRetry = !clientError && !cacheOnly && attempt < retryCount

    if (canRetry) {
      // Nothing is reported to JS yet: a retry that succeeds is not a failure.
      attempt += 1
      val delay = (retryDelayMs.toLong() shl (attempt - 1)).coerceAtMost(60_000L)
      val runnable = Runnable {
        retryRunnable = null
        load(spec, signature, pendingKey)
      }
      retryRunnable = runnable
      postDelayed(runnable, delay)
      return
    }

    // The previous image, if any, is not what the caller asked for any more.
    loadedSignature = null
    mainImageLoaded = false
    showDefaultSource()
    emitError(
      throwable.message ?: throwable.toString(),
      codeFor(throwable, reportedStatus, cacheOnly, unsatisfiable),
      reportedStatus,
      // A transient failure is worth retrying by hand; a 4xx or a cache miss is not.
      retryable = !clientError && !cacheOnly,
    )
    emitEvent(NextImageEvent.LOAD_END, null)
  }

  private fun codeFor(
    throwable: Throwable,
    status: Int,
    cacheOnly: Boolean,
    unsatisfiable: Boolean,
  ): String = when {
    // With the network disabled there is nothing to blame but the empty cache.
    cacheOnly -> "CACHE_MISS"
    // The cache missed and the device is offline.
    unsatisfiable -> "NETWORK"
    status in 400..499 -> "HTTP_CLIENT"
    status >= 500 -> "HTTP_SERVER"
    throwable is HttpException -> "NETWORK"
    throwable is java.io.IOException -> "NETWORK"
    else -> "DECODE"
  }

  /**
   * The placeholder is a separate request so that it can come from cache
   * without blocking the real image; it is dropped the moment the real image
   * arrives. It goes through the same policy and cache as any source.
   */
  private fun showPlaceholder(spec: NextImageRequestFactory.Spec, loader: ImageLoader) {
    placeholderDisposable?.dispose()
    placeholderDisposable = null
    val parsed = NextImageRequestFactory.parse(placeholderSource, NextImageConfigStore.current)
    if (parsed !is NextImageRequestFactory.Parsed.Ok) return
    if (parsed.spec.uri == spec.uri) return
    placeholderDisposable = loader.enqueue(
      secondaryRequest(parsed.spec) { image ->
        if (!mainImageLoaded) {
          setImageDrawable(image.asDrawable(resources))
        }
      }
    )
  }

  private fun showDefaultSource() {
    val parsed = NextImageRequestFactory.parse(defaultSource, NextImageConfigStore.current)
    if (parsed !is NextImageRequestFactory.Parsed.Ok) {
      if (!mainImageLoaded) {
        setImageDrawable(null)
      }
      return
    }
    val loader = NextImageImageLoader.getLoader(context)
    placeholderDisposable?.dispose()
    placeholderDisposable = loader.enqueue(
      secondaryRequest(parsed.spec) { image ->
        if (!mainImageLoaded) {
          setImageDrawable(image.asDrawable(resources))
        }
      }
    )
  }

  /** A placeholder or default image: sized to the view, never deferred. */
  private fun secondaryRequest(
    spec: NextImageRequestFactory.Spec,
    onSuccess: (Image) -> Unit,
  ): ImageRequest {
    val builder = ImageRequest.Builder(context)
    NextImageRequestFactory.apply(context, builder, spec, deferNetwork = false)
    return builder
      .size(ViewSizeResolver(this))
      .scale(scaleFor(resizeModeValue))
      .precision(Precision.INEXACT)
      .target(onSuccess = onSuccess)
      .build()
  }

  private fun applyScaleType() {
    scaleType = when (resizeModeValue) {
      RESIZE_CONTAIN -> ScaleType.FIT_CENTER
      RESIZE_STRETCH -> ScaleType.FIT_XY
      RESIZE_CENTER -> ScaleType.CENTER_INSIDE
      else -> ScaleType.CENTER_CROP
    }
  }

  private fun scaleFor(mode: String): Scale = when (mode) {
    RESIZE_CONTAIN, RESIZE_CENTER -> Scale.FIT
    else -> Scale.FILL
  }

  private fun applyFilters() {
    when {
      grayscaleEnabled -> {
        val matrix = ColorMatrix().apply { setSaturation(0f) }
        colorFilter = ColorMatrixColorFilter(matrix)
      }
      tintColorValue != null -> setColorFilter(tintColorValue!!, PorterDuff.Mode.SRC_IN)
      else -> clearColorFilter()
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setRenderEffect(
        if (blurRadiusValue > 0) {
          RenderEffect.createBlurEffect(
            blurRadiusValue.toFloat(),
            blurRadiusValue.toFloat(),
            Shader.TileMode.CLAMP,
          )
        } else {
          null
        }
      )
    }
  }

  private fun applyCustomTransition() {
    val duration = transitionDurationMs.toLong()
    if (duration <= 0L) return

    val animation: Animation? = when (transitionValue) {
      TRANSITION_SLIDE -> TranslateAnimation(0f, 0f, 50f, 0f).apply {
        this.duration = duration
      }
      TRANSITION_SCALE -> ScaleAnimation(
        0.9f,
        1f,
        0.9f,
        1f,
        Animation.RELATIVE_TO_SELF,
        0.5f,
        Animation.RELATIVE_TO_SELF,
        0.5f,
      ).apply { this.duration = duration }
      TRANSITION_GRAVITY -> TranslateAnimation(0f, 0f, -height.toFloat() / 2f, 0f).apply {
        this.duration = duration
        interpolator = OvershootInterpolator()
      }
      else -> null
    }
    animation?.let { startAnimation(it) }
  }

  /**
   * Progress is keyed by the url exactly as OkHttp sees it, so a source whose
   * spelling OkHttp normalises (upper-case host, unencoded characters) still
   * reports. Local assets have nothing to report.
   */
  private fun registerProgress(spec: NextImageRequestFactory.Spec) {
    unregisterProgress()
    if (!NextImageRequestFactory.isRemote(spec)) return
    val url = spec.uri.toHttpUrlOrNull()?.toString() ?: spec.uri
    val listener = NextImageProgressRegistry.Listener { loaded, total ->
      // Reported from OkHttp's reader thread; events are dispatched on the UI thread.
      UiThreadUtil.runOnUiThread {
        if (progressUrl != url) return@runOnUiThread
        val payload = Arguments.createMap().apply {
          putInt("loaded", loaded.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())
          putInt("total", total.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())
        }
        emitEvent(NextImageEvent.PROGRESS, payload, coalesce = true)
      }
    }
    progressUrl = url
    progressListener = listener
    NextImageProgressRegistry.register(url, listener)
  }

  private fun unregisterProgress() {
    val url = progressUrl
    val listener = progressListener
    if (url != null && listener != null) {
      NextImageProgressRegistry.unregister(url, listener)
    }
    progressUrl = null
    progressListener = null
  }

  private fun clearRequest() {
    retryRunnable?.let { removeCallbacks(it) }
    retryRunnable = null
    // Cleared before disposing, so the cancellation callback knows it was ours.
    pendingSignature = null
    disposable?.dispose()
    disposable = null
    placeholderDisposable?.dispose()
    placeholderDisposable = null
    unregisterProgress()
  }

  /** Called when the view manager drops or recycles this instance. */
  fun cleanup() {
    clearRequest()
    setImageDrawable(null)
    loadedSignature = null
    mainImageLoaded = false
    source = null
    placeholderSource = null
    defaultSource = null
    propsDirty = false
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    retryRunnable?.let { removeCallbacks(it) }
    retryRunnable = null
    unregisterProgress()
  }

  private fun emitSuccess(result: SuccessResult) {
    val payload = Arguments.createMap().apply {
      putDouble("width", result.image.width.toDouble())
      putDouble("height", result.image.height.toDouble())
      putString("cacheType", cacheTypeFor(result.dataSource))
      putInt("elapsed", (System.currentTimeMillis() - requestStartedAtMs).toInt())
    }
    emitEvent(NextImageEvent.LOAD, payload)
    emitEvent(NextImageEvent.LOAD_END, null)
  }

  private fun cacheTypeFor(dataSource: DataSource): String = when (dataSource) {
    DataSource.MEMORY_CACHE, DataSource.MEMORY -> "memory"
    DataSource.DISK -> "disk"
    DataSource.NETWORK -> "network"
  }

  private fun emitError(message: String, code: String, status: Int, retryable: Boolean) {
    val payload = Arguments.createMap().apply {
      putString("error", message)
      putString("code", code)
      putInt("status", status)
      putBoolean("retryable", retryable)
    }
    emitEvent(NextImageEvent.ERROR, payload)
  }

  private fun emitEvent(name: String, payload: WritableMap?, coalesce: Boolean = false) {
    val reactContext = context as? ReactContext ?: return
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    dispatcher.dispatchEvent(
      NextImageEvent(
        UIManagerHelper.getSurfaceId(this),
        id,
        name,
        payload,
        coalesce,
      )
    )
  }

  /**
   * Everything that changes either the request or the rendered bitmap. When
   * this is unchanged the view keeps what it is already showing instead of
   * re-decoding it.
   */
  private fun signatureOf(spec: NextImageRequestFactory.Spec): String = buildString {
    append(spec.cacheKey)
    append('|')
    append(spec.uri)
    append('|')
    append(spec.cache)
    append('|')
    append(spec.ttlSeconds)
    append('|')
    append(spec.priority)
    append('|')
    append(spec.headers.hashCode())
    append('|')
    append(resizeModeValue)
    append('|')
    append(borderRadiusPx)
    append('|')
    append(circleCrop)
    append('|')
    append(downsampleEnabled)
    // The blur only belongs here when it is baked into the bitmap. From API 31
    // it is a RenderEffect on the view, so changing it must not re-decode.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      append('|')
      append(blurRadiusValue)
    }
  }

  private companion object {
    const val RESIZE_CONTAIN = "contain"
    const val RESIZE_COVER = "cover"
    const val RESIZE_STRETCH = "stretch"
    const val RESIZE_CENTER = "center"
    const val TRANSITION_NONE = "none"
    const val TRANSITION_FADE = "fade"
    const val TRANSITION_SLIDE = "slide"
    const val TRANSITION_SCALE = "scale"
    const val TRANSITION_GRAVITY = "gravity"
  }
}
