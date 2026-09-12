package com.nextimage

import coil3.Extras
import coil3.decode.DataSource
import coil3.intercept.Interceptor
import coil3.memory.MemoryCache
import coil3.request.CachePolicy
import coil3.request.ImageResult
import coil3.request.SuccessResult

/** Request extra carrying the lifetime in milliseconds, 0 when the server decides. */
internal val TTL_MS_EXTRA = Extras.Key(default = 0L)

/**
 * Gives the memory tier the same lifetime as the disk tier.
 *
 * Coil's memory cache has no notion of expiry, so without this a source with
 * `cacheDuration: 1` would keep rendering from memory for the rest of the
 * session while its disk entry had long expired. The write time of every
 * memory entry is remembered here; a memory hit older than its lifetime is
 * re-run past the memory cache, which lands on disk or the network and
 * refreshes the entry.
 */
internal class NextImageMemoryTtlInterceptor : Interceptor {
  private val storedAt = object : LinkedHashMap<MemoryCache.Key, Long>(64, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<MemoryCache.Key, Long>?): Boolean =
      size > MAX_TRACKED
  }

  override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
    val request = chain.request
    val ttlMs = request.extras[TTL_MS_EXTRA] ?: 0L
    if (ttlMs <= 0L) return chain.proceed()

    val result = chain.proceed()
    if (result !is SuccessResult) return result
    val key = result.memoryCacheKey ?: return result
    val now = System.currentTimeMillis()

    if (result.dataSource != DataSource.MEMORY_CACHE) {
      remember(key, now)
      return result
    }

    val writtenAt = synchronized(storedAt) { storedAt[key] }
    if (writtenAt == null || now - writtenAt <= ttlMs) {
      return result
    }

    // Expired in memory: read past it, then let the fresh value replace it.
    synchronized(storedAt) { storedAt.remove(key) }
    val refreshed = chain
      .withRequest(request.newBuilder().memoryCachePolicy(CachePolicy.WRITE_ONLY).build())
      .proceed()
    if (refreshed is SuccessResult) {
      refreshed.memoryCacheKey?.let { remember(it, System.currentTimeMillis()) }
    }
    return refreshed
  }

  private fun remember(key: MemoryCache.Key, at: Long) {
    synchronized(storedAt) { storedAt[key] = at }
  }

  /** Test helper. */
  fun writeTime(key: MemoryCache.Key): Long? = synchronized(storedAt) { storedAt[key] }

  private companion object {
    const val MAX_TRACKED = 4096
  }
}
