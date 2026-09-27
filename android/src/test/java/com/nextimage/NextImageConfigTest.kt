package com.nextimage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NextImageConfigTest {

  private val defaults = NextImageConfig()

  @Test
  fun `defaults keep the network locked down`() {
    assertFalse(defaults.allowInsecureHttp)
    assertFalse(defaults.allowDataUri)
    assertFalse(defaults.allowFileUri)
    assertFalse(defaults.allowUriCredentials)
    assertTrue(defaults.blockPrivateNetworks)
    assertNull(defaults.allowedHosts)
    assertFalse(defaults.respectServerCacheHeaders)
    assertEquals(NextImageConfig.DEFAULT_DISK_CACHE_BYTES, defaults.diskCacheBytes)
  }

  @Test
  fun `reads booleans and host lists`() {
    val config = NextImageConfig.fromMap(
      mapOf(
        "allowInsecureHttp" to true,
        "blockPrivateNetworks" to false,
        "allowedHosts" to listOf("a.example.com", "", "b.example.com"),
        "blockedHosts" to listOf("bad.example.com"),
      ),
      defaults,
    )

    assertTrue(config.allowInsecureHttp)
    assertFalse(config.blockPrivateNetworks)
    assertEquals(listOf("a.example.com", "b.example.com"), config.allowedHosts)
    assertEquals(listOf("bad.example.com"), config.blockedHosts)
  }

  @Test
  fun `reads numbers arriving from JS as doubles`() {
    val config = NextImageConfig.fromMap(
      mapOf(
        "memoryCacheBytes" to 64.0 * 1024 * 1024,
        "diskCacheBytes" to 512.0 * 1024 * 1024,
        "requestTimeoutMs" to 15000.0,
        "maxHeaderCount" to 8.0,
        "maxDataUriBytes" to 4096.0,
      ),
      defaults,
    )

    assertEquals(64L * 1024 * 1024, config.memoryCacheBytes)
    assertEquals(512L * 1024 * 1024, config.diskCacheBytes)
    assertEquals(15_000L, config.requestTimeoutMs)
    assertEquals(8, config.maxHeaderCount)
    assertEquals(4096L, config.maxDataUriBytes)
  }

  @Test
  fun `clamps unreasonable sizes instead of accepting them`() {
    val config = NextImageConfig.fromMap(
      mapOf(
        "memoryCacheBytes" to 1.0,
        "diskCacheBytes" to 1.0,
        "requestTimeoutMs" to 1.0,
      ),
      defaults,
    )

    assertEquals(NextImageConfig.MIN_MEMORY_CACHE_BYTES, config.memoryCacheBytes)
    assertEquals(NextImageConfig.MIN_DISK_CACHE_BYTES, config.diskCacheBytes)
    assertEquals(1_000L, config.requestTimeoutMs)
  }

  @Test
  fun `ignores negative and non numeric values`() {
    val config = NextImageConfig.fromMap(
      mapOf(
        "memoryCacheBytes" to -5.0,
        "maxHeaderCount" to "eight",
        "allowInsecureHttp" to "yes",
      ),
      defaults,
    )

    assertEquals(defaults.memoryCacheBytes, config.memoryCacheBytes)
    assertEquals(defaults.maxHeaderCount, config.maxHeaderCount)
    assertFalse(config.allowInsecureHttp)
  }

  @Test
  fun `keeps only well formed certificate pins`() {
    val goodPin = "sha256/" + "A".repeat(43) + "="
    val config = NextImageConfig.fromMap(
      mapOf(
        "certificatePins" to mapOf(
          "a.example.com" to listOf(goodPin, "sha256/tooshort"),
          "b.example.com" to listOf("not-a-pin"),
          "c.example.com" to emptyList<String>(),
        )
      ),
      defaults,
    )

    // A malformed pin must never be treated as a pin; a host left with none is dropped.
    assertEquals(mapOf("a.example.com" to listOf(goodPin)), config.certificatePins)
  }

  @Test
  fun `only cache and transport changes rebuild the loader`() {
    assertTrue(
      NextImageConfig.requiresLoaderRebuild(defaults, defaults.copy(diskCacheBytes = 1_000_000))
    )
    assertTrue(
      NextImageConfig.requiresLoaderRebuild(defaults, defaults.copy(requestTimeoutMs = 5_000))
    )
    assertTrue(
      NextImageConfig.requiresLoaderRebuild(defaults, defaults.copy(allowInsecureHttp = true))
    )
    assertFalse(
      NextImageConfig.requiresLoaderRebuild(defaults, defaults.copy(blockedHosts = listOf("x")))
    )
    assertFalse(
      NextImageConfig.requiresLoaderRebuild(
        defaults,
        defaults.copy(respectServerCacheHeaders = true),
      )
    )
  }

  @Test
  fun `maps pin host patterns onto patterns OkHttp accepts`() {
    assertEquals(listOf("cdn.example.com"), NextImageImageLoader.okHttpPinPatterns("cdn.example.com"))
    assertEquals(
      listOf("**.example.com"),
      NextImageImageLoader.okHttpPinPatterns("*.example.com"),
    )
    assertEquals(
      listOf("**.example.com"),
      NextImageImageLoader.okHttpPinPatterns(".Example.com"),
    )

    // `.example.com` used to reach OkHttp as is and throw while the client was built.
    val pin = "sha256/" + "A".repeat(43) + "="
    val pinner = okhttp3.CertificatePinner.Builder()
    for (host in listOf("cdn.example.com", "*.example.org", ".example.net")) {
      for (pattern in NextImageImageLoader.okHttpPinPatterns(host)) {
        pinner.add(pattern, pin)
      }
    }
    val built = pinner.build()
    assertEquals(listOf(pin), built.findMatchingPins("example.net").map { it.toString() })
    assertEquals(listOf(pin), built.findMatchingPins("a.b.example.org").map { it.toString() })
    assertEquals(listOf(pin), built.findMatchingPins("cdn.example.com").map { it.toString() })
    assertTrue(built.findMatchingPins("example.com").isEmpty())
    assertTrue(built.findMatchingPins("other.example.com").isEmpty())
  }
}
