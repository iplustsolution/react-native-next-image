package com.nextimage

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.ForwardingSource
import okio.Source
import okio.buffer

/** Request header carrying the per-request cache lifetime, in seconds. */
internal const val TTL_HEADER = "X-NextImage-Ttl"

/** A TTL at or above this many seconds is written as `immutable`. */
private const val IMMUTABLE_TTL_SECONDS = 60L * 60 * 24 * 365

/**
 * Makes the on-disk lifetime of an image NextImage's decision rather than the
 * server's.
 *
 * Coil's default cache strategy decides whether a stored response is still
 * fresh by reading its cache headers. Many CDNs and app servers send
 * `no-store`, `no-cache` or a short `max-age`, which forces a download on
 * every render. This interceptor replaces those headers on the way in, so the
 * stored entry stays fresh for exactly `cacheDuration` and the URL is fetched
 * once. `ETag` and `Last-Modified` are preserved so that revalidating after
 * expiry can still answer 304.
 *
 * The TTL travels as an internal request header, which is stripped before the
 * request leaves the device.
 */
internal class NextImageCacheControlInterceptor(
  private val respectServerCacheHeaders: () -> Boolean,
) : Interceptor {

  override fun intercept(chain: Interceptor.Chain): Response {
    val original = chain.request()
    val ttlSeconds = original.header(TTL_HEADER)?.toLongOrNull()

    val request = if (ttlSeconds == null) {
      original
    } else {
      original.newBuilder().removeHeader(TTL_HEADER).build()
    }

    val response = chain.proceed(request)

    if (ttlSeconds == null || ttlSeconds <= 0L || respectServerCacheHeaders()) {
      return response
    }
    // Only rewrite responses that actually carry an image.
    if (!response.isSuccessful) {
      return response
    }

    val cacheControl = if (ttlSeconds >= IMMUTABLE_TTL_SECONDS) {
      "public, max-age=$ttlSeconds, immutable"
    } else {
      "public, max-age=$ttlSeconds"
    }

    return response.newBuilder()
      .removeHeader("Pragma")
      .removeHeader("Expires")
      .removeHeader("Vary")
      .header("Cache-Control", cacheControl)
      .build()
  }
}

/**
 * Bridges OkHttp's byte counting to the views that asked for progress.
 *
 * Coil has no progress API, so download progress is measured by wrapping the
 * response body. Nothing is wrapped when no view is listening for the URL.
 */
internal object NextImageProgressRegistry {
  fun interface Listener {
    fun onProgress(loaded: Long, total: Long)
  }

  private val listeners = ConcurrentHashMap<String, CopyOnWriteArrayList<Listener>>()

  fun register(url: String, listener: Listener) {
    listeners.getOrPut(url) { CopyOnWriteArrayList() }.add(listener)
  }

  fun unregister(url: String, listener: Listener) {
    val forUrl = listeners[url] ?: return
    forUrl.remove(listener)
    if (forUrl.isEmpty()) {
      listeners.remove(url, forUrl)
    }
  }

  fun hasListeners(url: String): Boolean = listeners[url]?.isNotEmpty() == true

  fun report(url: String, loaded: Long, total: Long) {
    val forUrl = listeners[url] ?: return
    for (listener in forUrl) {
      listener.onProgress(loaded, total)
    }
  }

  /** Test and teardown helper. */
  fun clear() {
    listeners.clear()
  }
}

internal class NextImageProgressInterceptor : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val url = chain.request().url.toString()
    val response = chain.proceed(chain.request())
    val body = response.body
    if (body == null || !NextImageProgressRegistry.hasListeners(url)) {
      return response
    }
    return response.newBuilder()
      .body(ProgressResponseBody(body, url))
      .build()
  }
}

private class ProgressResponseBody(
  private val delegate: ResponseBody,
  private val url: String,
) : ResponseBody() {

  private val bufferedSource: BufferedSource by lazy { tracking(delegate.source()).buffer() }

  override fun contentType(): MediaType? = delegate.contentType()

  override fun contentLength(): Long = delegate.contentLength()

  override fun source(): BufferedSource = bufferedSource

  private fun tracking(source: Source): Source = object : ForwardingSource(source) {
    private var loaded = 0L
    private var lastReportedAt = 0L
    // Read once: ForwardingSource also has a `delegate`, and the body's length
    // does not change while it is being streamed.
    private val total = this@ProgressResponseBody.delegate.contentLength()

    override fun read(sink: Buffer, byteCount: Long): Long {
      val read = super.read(sink, byteCount)
      if (read != -1L) {
        loaded += read
      }
      val now = System.currentTimeMillis()
      // Throttle: a 2MB image would otherwise emit hundreds of events.
      val finished = read == -1L || (total > 0 && loaded >= total)
      if (finished || now - lastReportedAt >= PROGRESS_INTERVAL_MS) {
        lastReportedAt = now
        NextImageProgressRegistry.report(url, loaded, total)
      }
      return read
    }
  }

  private companion object {
    const val PROGRESS_INTERVAL_MS = 50L
  }
}
