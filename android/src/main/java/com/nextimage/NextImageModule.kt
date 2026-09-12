package com.nextimage

import coil3.request.CachePolicy
import coil3.request.ImageRequest
import coil3.size.Precision
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** Cache and configuration APIs behind `NextImage.preload`, `NextImage.isCached` and friends. */
@ReactModule(name = NextImageModule.NAME)
class NextImageModule(reactContext: ReactApplicationContext) :
  NativeNextImageModuleSpec(reactContext) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun getName() = NAME

  override fun preload(sources: ReadableArray) {
    val context = reactApplicationContext
    val loader = NextImageImageLoader.getLoader(context)
    val config = NextImageConfigStore.current

    for (index in 0 until sources.size()) {
      val source = sources.getMap(index) ?: continue
      val parsed = NextImageRequestFactory.parse(source, config)
      if (parsed !is NextImageRequestFactory.Parsed.Ok) continue
      loader.enqueue(prefetchRequest(parsed.spec))
    }
  }

  override fun prefetch(uris: ReadableArray, priority: String, promise: Promise) {
    val context = reactApplicationContext
    val loader = NextImageImageLoader.getLoader(context)
    val config = NextImageConfigStore.current
    var accepted = 0

    for (index in 0 until uris.size()) {
      val uri = uris.getString(index) ?: continue
      when (val result = NextImageSecurity.validateUri(uri, config)) {
        is NextImageSecurity.UriResult.Blocked -> Unit
        is NextImageSecurity.UriResult.Allowed -> {
          val spec = NextImageRequestFactory.Spec(
            uri = result.uri,
            headers = emptyMap(),
            priority = priority,
            cache = NextImageRequestFactory.CACHE_IMMUTABLE,
            ttlSeconds = (NextImageConfig.DEFAULT_CACHE_DURATION_MINUTES * 60).toLong(),
            cacheKey = result.uri,
          )
          loader.enqueue(prefetchRequest(spec))
          accepted += 1
        }
      }
    }

    promise.resolve(accepted.toDouble())
  }

  /**
   * A prefetch stores bytes, it does not populate the screen. Decoding is
   * bounded and the memory cache is left alone so that warming a long list
   * cannot push live images out of memory or allocate full size bitmaps.
   */
  private fun prefetchRequest(spec: NextImageRequestFactory.Spec): ImageRequest {
    val builder = ImageRequest.Builder(reactApplicationContext)
    NextImageRequestFactory.apply(builder, spec, deferNetwork = false)
    return builder
      .memoryCachePolicy(CachePolicy.DISABLED)
      .size(PREFETCH_DECODE_SIZE, PREFETCH_DECODE_SIZE)
      .precision(Precision.INEXACT)
      .build()
  }

  override fun clearMemoryCache(promise: Promise) {
    NextImageImageLoader.peekLoader()?.memoryCache?.clear()
    promise.resolve(null)
  }

  override fun clearDiskCache(promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    scope.launch {
      runCatching { loader.diskCache?.clear() }
        .onSuccess { promise.resolve(null) }
        .onFailure { promise.reject(ERROR_CACHE, it.message, it) }
    }
  }

  override fun isCached(uri: String, cacheKey: String, promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    val key = cacheKey.ifBlank { uri }

    val inMemory = loader.memoryCache?.keys?.any { it.key == uri } == true
    if (inMemory) {
      promise.resolve(true)
      return
    }

    scope.launch {
      val onDisk = runCatching {
        loader.diskCache?.openSnapshot(key)?.use { true } ?: false
      }.getOrDefault(false)
      promise.resolve(onDisk)
    }
  }

  override fun removeFromCache(uri: String, cacheKey: String, promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    val key = cacheKey.ifBlank { uri }

    val memoryCache = loader.memoryCache
    var removed = false
    if (memoryCache != null) {
      // The memory key carries the request size and transformations, so every
      // variant of this uri has to go.
      for (memoryKey in memoryCache.keys.filter { it.key == uri }) {
        removed = memoryCache.remove(memoryKey) || removed
      }
    }

    scope.launch {
      val diskRemoved = runCatching { loader.diskCache?.remove(key) ?: false }
        .getOrDefault(false)
      promise.resolve(removed || diskRemoved)
    }
  }

  override fun getDiskCacheSize(promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    scope.launch {
      val size = runCatching { loader.diskCache?.size ?: 0L }.getOrDefault(0L)
      promise.resolve(size.toDouble())
    }
  }

  override fun getMemoryCacheSize(promise: Promise) {
    val size = NextImageImageLoader.peekLoader()?.memoryCache?.size ?: 0L
    promise.resolve(size.toDouble())
  }

  override fun setCacheLimits(memoryBytes: Double, diskBytes: Double, promise: Promise) {
    if (memoryBytes < 0 || diskBytes < 0) {
      promise.reject(ERROR_CONFIG, "Cache limits must not be negative.")
      return
    }
    NextImageConfigStore.updateCacheLimits(memoryBytes.toLong(), diskBytes.toLong())
    NextImageImageLoader.invalidate()
    promise.resolve(null)
  }

  override fun configure(options: ReadableMap) {
    if (NextImageConfigStore.update(options)) {
      NextImageImageLoader.invalidate()
    }
  }

  override fun invalidate() {
    scope.cancel()
    NextImageProgressRegistry.clear()
    super.invalidate()
  }

  companion object {
    const val NAME = "NextImageModule"
    private const val ERROR_CACHE = "E_NEXT_IMAGE_CACHE"
    private const val ERROR_CONFIG = "E_NEXT_IMAGE_CONFIG"
    private const val PREFETCH_DECODE_SIZE = 512
  }
}
