package com.nextimage

import coil3.ImageLoader
import coil3.Uri
import coil3.fetch.Fetcher
import coil3.request.Options
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Downloads a URL once even when several requests for it start together.
 *
 * Coil coalesces nothing across requests: two views showing the same photo at
 * different sizes, or a view and a preload, are separate requests with
 * separate memory keys. Both miss the disk while the first download is still
 * in flight, and both go to the network. Fetches for one disk cache key are
 * therefore run one at a time; Coil's network fetcher reads the disk cache
 * before anything else and returns only after the bytes are committed, so the
 * second fetch finds the first one's entry and is served from disk.
 */
internal class NextImageDedupFetcherFactory(
  private val delegate: Fetcher.Factory<Uri>,
) : Fetcher.Factory<Uri> {

  override fun create(data: Uri, options: Options, imageLoader: ImageLoader): Fetcher? {
    val fetcher = delegate.create(data, options, imageLoader) ?: return null
    val key = options.diskCacheKey ?: data.toString()
    return Fetcher { NextImageInFlight.withKey(key) { fetcher.fetch() } }
  }
}

/** One mutex per disk cache key, held only while a fetch for that key runs. */
internal object NextImageInFlight {
  private class Entry {
    val mutex = Mutex()
    var users = 0
  }

  private val entries = HashMap<String, Entry>()

  suspend fun <T> withKey(key: String, block: suspend () -> T): T {
    val entry = synchronized(entries) {
      entries.getOrPut(key) { Entry() }.also { it.users++ }
    }
    try {
      return entry.mutex.withLock { block() }
    } finally {
      synchronized(entries) {
        entry.users--
        if (entry.users == 0) entries.remove(key)
      }
    }
  }

  /** Test helper. */
  fun size(): Int = synchronized(entries) { entries.size }
}
