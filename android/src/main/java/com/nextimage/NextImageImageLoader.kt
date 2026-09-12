package com.nextimage

import android.content.Context
import android.content.pm.ApplicationInfo
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.network.cachecontrol.CacheControlCacheStrategy
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import com.facebook.react.bridge.ReadableMap
import java.util.concurrent.TimeUnit
import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.Dispatcher
import okhttp3.OkHttpClient

/** Holds the active [NextImageConfig] and reports when the loader must be rebuilt. */
object NextImageConfigStore {
  @Volatile
  var current: NextImageConfig = NextImageConfig()
    private set

  /** @return true when the change affects the loader or HTTP client. */
  fun update(options: ReadableMap?): Boolean {
    if (options == null) return false
    val previous = current
    val next = NextImageConfig.fromMap(options.toHashMap(), previous)
    current = next
    return NextImageConfig.requiresLoaderRebuild(previous, next)
  }

  /** Applied from `NextImage.setCacheLimits`. 0 keeps the current value for a tier. */
  fun updateCacheLimits(memoryBytes: Long, diskBytes: Long) {
    val previous = current
    current = previous.copy(
      memoryCacheBytes = if (memoryBytes > 0) {
        memoryBytes.coerceAtLeast(NextImageConfig.MIN_MEMORY_CACHE_BYTES)
      } else {
        previous.memoryCacheBytes
      },
      diskCacheBytes = if (diskBytes > 0) {
        diskBytes.coerceAtLeast(NextImageConfig.MIN_DISK_CACHE_BYTES)
      } else {
        previous.diskCacheBytes
      },
    )
  }

  /** Test helper. */
  fun reset() {
    current = NextImageConfig()
  }
}

/**
 * The single Coil [ImageLoader] used by every NextImage view and by the
 * preload APIs, so all of them share one memory cache, one disk cache and one
 * connection pool.
 */
object NextImageImageLoader {
  private const val CACHE_DIRECTORY = "next_image_cache"
  private const val MEMORY_CACHE_PERCENT = 0.25

  @Volatile
  private var loader: ImageLoader? = null

  @Volatile
  private var client: OkHttpClient? = null

  fun getLoader(context: Context): ImageLoader {
    loader?.let { return it }
    return synchronized(this) {
      loader ?: build(context.applicationContext).also { loader = it }
    }
  }

  /** The loader without creating one; used by cache queries that must not allocate. */
  fun peekLoader(): ImageLoader? = loader

  /**
   * Drop the loader so the next request rebuilds it with the current config.
   * In-flight requests are cancelled; a view that sees its request cancelled
   * this way re-enqueues it on the new loader.
   */
  fun invalidate() {
    synchronized(this) {
      val previous = loader
      loader = null
      previous?.shutdown()
      // Two disk caches must never share a directory, so the old one is
      // closed before a new loader can open the same folder.
      previous?.diskCache?.shutdown()
      client?.dispatcher?.executorService?.shutdown()
      client?.connectionPool?.evictAll()
      client = null
    }
  }

  private fun build(context: Context): ImageLoader {
    val config = NextImageConfigStore.current
    val debuggable = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    val httpClient = buildClient(config, debuggable).also { client = it }

    return ImageLoader.Builder(context)
      .components {
        add(NextImageMemoryTtlInterceptor())
        add(
          OkHttpNetworkFetcherFactory(
            callFactory = { httpClient },
            // Honour the Cache-Control headers the interceptor writes, so a
            // stored entry expires after exactly `cacheDuration`.
            cacheStrategy = { CacheControlCacheStrategy() },
          )
        )
      }
      .memoryCache {
        MemoryCache.Builder()
          .apply {
            if (config.memoryCacheBytes > 0) {
              maxSizeBytes(config.memoryCacheBytes)
            } else {
              maxSizePercent(context, MEMORY_CACHE_PERCENT)
            }
          }
          .strongReferencesEnabled(true)
          .weakReferencesEnabled(true)
          .build()
      }
      .diskCache {
        DiskCache.Builder()
          .directory(context.cacheDir.resolve(CACHE_DIRECTORY))
          .maxSizeBytes(config.diskCacheBytes)
          .build()
      }
      // Transitions are decided per request, so the loader default stays off.
      .crossfade(false)
      .build()
  }

  private fun buildClient(config: NextImageConfig, debuggable: Boolean): OkHttpClient {
    val timeout = config.requestTimeoutMs

    val builder = OkHttpClient.Builder()
      .connectTimeout(timeout, TimeUnit.MILLISECONDS)
      .readTimeout(timeout, TimeUnit.MILLISECONDS)
      .writeTimeout(timeout, TimeUnit.MILLISECONDS)
      .retryOnConnectionFailure(true)
      // An https request must never be redirected onto cleartext: that would
      // leak whatever Authorization header the caller attached.
      .followSslRedirects(config.allowInsecureHttp)
      .connectionPool(ConnectionPool(8, 5, TimeUnit.MINUTES))
      .dispatcher(
        Dispatcher().apply {
          maxRequests = 64
          maxRequestsPerHost = 10
        }
      )
      .connectionSpecs(
        if (config.allowInsecureHttp || debuggable) {
          // A debug build must reach Metro over plain http for `require()`d
          // assets. The URL policy still refuses every other http source, and
          // the app's network security config has the final say.
          listOf(ConnectionSpec.MODERN_TLS, ConnectionSpec.CLEARTEXT)
        } else {
          // Without the cleartext spec, an http:// request cannot connect at all.
          listOf(ConnectionSpec.MODERN_TLS)
        }
      )
      // First, so a cache-only request never reaches the network at all.
      .addInterceptor(NextImageOnlyIfCachedInterceptor())
      .addInterceptor(
        NextImageCacheControlInterceptor { NextImageConfigStore.current.respectServerCacheHeaders }
      )
      .addInterceptor(NextImageProgressInterceptor())

    if (config.certificatePins.isNotEmpty()) {
      val pinner = CertificatePinner.Builder()
      for ((host, pins) in config.certificatePins) {
        pinner.add(host, *pins.toTypedArray())
      }
      builder.certificatePinner(pinner.build())
    }

    return builder.build()
  }
}
