package com.nextimage

import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import coil3.request.CachePolicy
import coil3.request.ImageRequest
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi

/**
 * Turns a JS `source` object into a validated Coil request.
 *
 * Shared by the view and by the preload APIs so that a preloaded image lands
 * under the same cache key the view will later look up.
 */
internal object NextImageRequestFactory {

  data class Spec(
    val uri: String,
    val headers: Map<String, String>,
    val priority: String,
    val cache: String,
    /** Lifetime of the downloaded bytes, in seconds. 0 means "server decides". */
    val ttlSeconds: Long,
    /** Stable disk cache key: `source.cacheKey` when given, otherwise the uri. */
    val cacheKey: String,
  )

  sealed class Parsed {
    data class Ok(val spec: Spec) : Parsed()
    data class Blocked(val code: String, val message: String) : Parsed()
    object Empty : Parsed()
  }

  /** Low priority requests get a narrow lane so they cannot starve visible ones. */
  @OptIn(ExperimentalCoroutinesApi::class)
  private val lowPriorityDispatcher by lazy { Dispatchers.IO.limitedParallelism(2) }

  fun parse(source: ReadableMap?, config: NextImageConfig): Parsed {
    if (source == null) return Parsed.Empty
    val rawUri = if (source.hasKey("uri")) source.getString("uri") else null
    if (rawUri.isNullOrEmpty()) return Parsed.Empty

    return when (val result = NextImageSecurity.validateUri(rawUri, config)) {
      is NextImageSecurity.UriResult.Blocked -> Parsed.Blocked(result.code, result.message)
      is NextImageSecurity.UriResult.Allowed -> {
        val sanitized = NextImageSecurity.sanitizeHeaders(readHeaders(source), config)
        val cache = readCache(source)
        Parsed.Ok(
          Spec(
            uri = result.uri,
            headers = sanitized.headers,
            priority = readPriority(source),
            cache = cache,
            ttlSeconds = readTtlSeconds(source, cache),
            cacheKey = readCacheKey(source) ?: result.uri,
          )
        )
      }
    }
  }

  /**
   * Apply the caching rules that make a URL download once:
   * memory and disk reads are enabled, the disk key is stable, and the TTL
   * rides along as an internal header for the cache-control interceptor.
   *
   * @param deferNetwork when true the request may only be served from cache.
   */
  fun apply(
    builder: ImageRequest.Builder,
    spec: Spec,
    deferNetwork: Boolean,
  ): ImageRequest.Builder {
    builder.data(spec.uri)

    if (spec.cacheKey != spec.uri) {
      // Leave the memory cache key alone: Coil derives it from the request size
      // and transformations, and overriding it would let a small thumbnail
      // satisfy a full-size view.
      builder.diskCacheKey(spec.cacheKey)
    }

    val headers = NetworkHeaders.Builder()
    for ((name, value) in spec.headers) {
      headers.add(name, value)
    }
    if (spec.ttlSeconds > 0 && spec.cache != CACHE_WEB) {
      headers.set(TTL_HEADER, spec.ttlSeconds.toString())
    }
    builder.httpHeaders(headers.build())

    when {
      // An explicit refresh outranks the viewport gate: serving the stale copy
      // is not what the caller asked for.
      spec.cache == CACHE_RELOAD -> {
        // Read past the caches, then write the new bytes.
        builder.memoryCachePolicy(CachePolicy.WRITE_ONLY)
        builder.diskCachePolicy(CachePolicy.WRITE_ONLY)
        builder.networkCachePolicy(CachePolicy.ENABLED)
      }
      deferNetwork || spec.cache == CACHE_ONLY -> {
        builder.memoryCachePolicy(CachePolicy.ENABLED)
        builder.diskCachePolicy(CachePolicy.ENABLED)
        builder.networkCachePolicy(CachePolicy.DISABLED)
      }
      else -> {
        builder.memoryCachePolicy(CachePolicy.ENABLED)
        builder.diskCachePolicy(CachePolicy.ENABLED)
        builder.networkCachePolicy(CachePolicy.ENABLED)
      }
    }

    if (spec.priority == PRIORITY_LOW) {
      builder.fetcherCoroutineContext(lowPriorityDispatcher)
    }

    return builder
  }

  private fun readHeaders(source: ReadableMap): List<Pair<String, String>> {
    if (!source.hasKey("headers")) return emptyList()
    val result = mutableListOf<Pair<String, String>>()

    when (source.getType("headers")) {
      ReadableType.Array -> {
        val array = source.getArray("headers") ?: return emptyList()
        for (index in 0 until array.size()) {
          val entry = array.getMap(index) ?: continue
          val name = if (entry.hasKey("name")) entry.getString("name") else null
          val value = if (entry.hasKey("value")) entry.getString("value") else null
          if (name != null && value != null) {
            result.add(name to value)
          }
        }
      }
      // Tolerate the plain `{ name: value }` shape for native callers.
      ReadableType.Map -> {
        val map = source.getMap("headers")?.toHashMap() ?: return emptyList()
        for ((name, value) in map) {
          if (value is String) {
            result.add(name to value)
          }
        }
      }
      else -> Unit
    }

    return result
  }

  private fun readPriority(source: ReadableMap): String {
    val value = if (source.hasKey("priority")) source.getString("priority") else null
    return when (value) {
      PRIORITY_LOW -> PRIORITY_LOW
      PRIORITY_HIGH -> PRIORITY_HIGH
      else -> PRIORITY_NORMAL
    }
  }

  private fun readCache(source: ReadableMap): String {
    val value = if (source.hasKey("cache")) source.getString("cache") else null
    return when (value) {
      CACHE_WEB -> CACHE_WEB
      CACHE_ONLY -> CACHE_ONLY
      CACHE_RELOAD -> CACHE_RELOAD
      else -> CACHE_IMMUTABLE
    }
  }

  private fun readCacheKey(source: ReadableMap): String? {
    val value = if (source.hasKey("cacheKey")) source.getString("cacheKey") else null
    return value?.takeIf { it.isNotBlank() }
  }

  private fun readTtlSeconds(source: ReadableMap, cache: String): Long {
    if (cache == CACHE_WEB) return 0
    val minutes = if (source.hasKey("cacheDuration") &&
      source.getType("cacheDuration") == ReadableType.Number
    ) {
      source.getDouble("cacheDuration")
    } else {
      NextImageConfig.DEFAULT_CACHE_DURATION_MINUTES
    }
    if (minutes <= 0) return 0
    return (minutes * 60.0).toLong().coerceAtLeast(1L)
  }

  const val PRIORITY_LOW = "low"
  const val PRIORITY_NORMAL = "normal"
  const val PRIORITY_HIGH = "high"
  const val CACHE_IMMUTABLE = "immutable"
  const val CACHE_WEB = "web"
  const val CACHE_ONLY = "cacheOnly"
  const val CACHE_RELOAD = "reload"
}
