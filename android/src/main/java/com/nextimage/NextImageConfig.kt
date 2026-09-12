package com.nextimage

/**
 * Runtime configuration, set from JS through `NextImage.configure(...)`.
 *
 * Pure Kotlin on purpose: the parsing rules are unit tested on the JVM, and
 * only [NextImageConfigStore] knows about `ReadableMap`.
 */
data class NextImageConfig(
  val allowInsecureHttp: Boolean = false,
  val allowDataUri: Boolean = false,
  val allowFileUri: Boolean = false,
  val allowedHosts: List<String>? = null,
  val blockedHosts: List<String> = emptyList(),
  val blockPrivateNetworks: Boolean = true,
  val allowUriCredentials: Boolean = false,
  val maxUriLength: Int = 8192,
  val maxDataUriBytes: Long = 2L * 1024 * 1024,
  val maxHeaderCount: Int = 24,
  val maxHeaderNameLength: Int = 128,
  val maxHeaderValueLength: Int = 8192,
  /** SPKI pins per host in `sha256/<base64>` form. Empty disables pinning. */
  val certificatePins: Map<String, List<String>> = emptyMap(),
  /** 0 means "25% of the app heap". */
  val memoryCacheBytes: Long = 0,
  val diskCacheBytes: Long = DEFAULT_DISK_CACHE_BYTES,
  val requestTimeoutMs: Long = 30_000,
  /**
   * When false, NextImage rewrites `Cache-Control` on responses so an image is
   * kept for its `cacheDuration` regardless of what the server sends. This is
   * what makes a URL download exactly once.
   */
  val respectServerCacheHeaders: Boolean = false,
) {
  companion object {
    const val DEFAULT_DISK_CACHE_BYTES: Long = 250L * 1024 * 1024
    const val DEFAULT_CACHE_DURATION_MINUTES: Double = 10080.0
    const val MIN_MEMORY_CACHE_BYTES: Long = 1L * 1024 * 1024
    const val MIN_DISK_CACHE_BYTES: Long = 4L * 1024 * 1024

    private val PIN_REGEX = Regex("^sha256/[A-Za-z0-9+/]{43}=$")

    /** Changes to these fields require the image loader to be rebuilt. */
    fun requiresLoaderRebuild(before: NextImageConfig, after: NextImageConfig): Boolean =
      before.memoryCacheBytes != after.memoryCacheBytes ||
        before.diskCacheBytes != after.diskCacheBytes ||
        before.requestTimeoutMs != after.requestTimeoutMs ||
        before.certificatePins != after.certificatePins ||
        before.allowInsecureHttp != after.allowInsecureHttp

    @Suppress("UNCHECKED_CAST")
    fun fromMap(options: Map<String, Any?>, base: NextImageConfig): NextImageConfig {
      var next = base

      (options["allowInsecureHttp"] as? Boolean)?.let { next = next.copy(allowInsecureHttp = it) }
      (options["allowDataUri"] as? Boolean)?.let { next = next.copy(allowDataUri = it) }
      (options["allowFileUri"] as? Boolean)?.let { next = next.copy(allowFileUri = it) }
      (options["blockPrivateNetworks"] as? Boolean)?.let {
        next = next.copy(blockPrivateNetworks = it)
      }
      (options["allowUriCredentials"] as? Boolean)?.let {
        next = next.copy(allowUriCredentials = it)
      }
      (options["respectServerCacheHeaders"] as? Boolean)?.let {
        next = next.copy(respectServerCacheHeaders = it)
      }

      if (options.containsKey("allowedHosts")) {
        val hosts = toStringList(options["allowedHosts"])
        next = next.copy(allowedHosts = hosts)
      }
      if (options.containsKey("blockedHosts")) {
        next = next.copy(blockedHosts = toStringList(options["blockedHosts"]) ?: emptyList())
      }

      toPositiveInt(options["maxUriLength"])?.let { next = next.copy(maxUriLength = it) }
      toPositiveLong(options["maxDataUriBytes"])?.let { next = next.copy(maxDataUriBytes = it) }
      toPositiveInt(options["maxHeaderCount"])?.let { next = next.copy(maxHeaderCount = it) }
      toPositiveInt(options["maxHeaderNameLength"])?.let {
        next = next.copy(maxHeaderNameLength = it)
      }
      toPositiveInt(options["maxHeaderValueLength"])?.let {
        next = next.copy(maxHeaderValueLength = it)
      }

      toPositiveLong(options["memoryCacheBytes"])?.let {
        next = next.copy(memoryCacheBytes = it.coerceAtLeast(MIN_MEMORY_CACHE_BYTES))
      }
      toPositiveLong(options["diskCacheBytes"])?.let {
        next = next.copy(diskCacheBytes = it.coerceAtLeast(MIN_DISK_CACHE_BYTES))
      }
      toPositiveLong(options["requestTimeoutMs"])?.let {
        next = next.copy(requestTimeoutMs = it.coerceIn(1_000L, 300_000L))
      }

      if (options.containsKey("certificatePins")) {
        next = next.copy(certificatePins = parsePins(options["certificatePins"]))
      }

      return next
    }

    private fun toStringList(value: Any?): List<String>? {
      val list = value as? List<*> ?: return null
      return list.mapNotNull { it as? String }.filter { it.isNotBlank() }
    }

    private fun toPositiveInt(value: Any?): Int? {
      val number = value as? Number ?: return null
      val int = number.toInt()
      return if (int > 0) int else null
    }

    private fun toPositiveLong(value: Any?): Long? {
      val number = value as? Number ?: return null
      val long = number.toLong()
      return if (long > 0) long else null
    }

    /** Malformed pins are dropped rather than trusted: a bad pin must not weaken TLS. */
    private fun parsePins(value: Any?): Map<String, List<String>> {
      val map = value as? Map<*, *> ?: return emptyMap()
      val result = LinkedHashMap<String, List<String>>()
      for ((host, pins) in map) {
        val hostName = host as? String ?: continue
        val pinList = (pins as? List<*>)
          ?.mapNotNull { it as? String }
          ?.filter { PIN_REGEX.matches(it) }
          ?: continue
        if (pinList.isNotEmpty()) {
          result[hostName] = pinList
        }
      }
      return result
    }
  }
}
