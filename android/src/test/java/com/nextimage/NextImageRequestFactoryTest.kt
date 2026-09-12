package com.nextimage

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The JS `source` object to request spec translation, on the plain JVM. */
class NextImageRequestFactoryTest {

  private val config = NextImageConfig()

  private fun ok(source: JavaOnlyMap): NextImageRequestFactory.Spec {
    val parsed = NextImageRequestFactory.parse(source, config)
    assertTrue("expected Ok, got $parsed", parsed is NextImageRequestFactory.Parsed.Ok)
    return (parsed as NextImageRequestFactory.Parsed.Ok).spec
  }

  @Test
  fun `an empty or missing uri is empty, not an error`() {
    assertEquals(NextImageRequestFactory.Parsed.Empty, NextImageRequestFactory.parse(null, config))
    assertEquals(
      NextImageRequestFactory.Parsed.Empty,
      NextImageRequestFactory.parse(JavaOnlyMap.of("uri", ""), config),
    )
  }

  @Test
  fun `defaults match the JS layer`() {
    val spec = ok(JavaOnlyMap.of("uri", "https://example.com/a.jpg"))
    assertEquals("https://example.com/a.jpg", spec.uri)
    assertEquals("https://example.com/a.jpg", spec.cacheKey)
    assertEquals(NextImageRequestFactory.PRIORITY_NORMAL, spec.priority)
    assertEquals(NextImageRequestFactory.CACHE_IMMUTABLE, spec.cache)
    assertEquals((NextImageConfig.DEFAULT_CACHE_DURATION_MINUTES * 60).toLong(), spec.ttlSeconds)
    assertFalse(spec.bundled)
    assertTrue(spec.headers.isEmpty())
  }

  @Test
  fun `reads the full source shape sent by JS`() {
    val spec = ok(
      JavaOnlyMap.of(
        "uri", "https://example.com/a.jpg?sig=1",
        "headers", JavaOnlyArray.of(
          JavaOnlyMap.of("name", "Authorization", "value", "Bearer t"),
          JavaOnlyMap.of("name", "Host", "value", "evil.example.com"),
        ),
        "priority", "high",
        "cache", "web",
        "cacheDuration", 30.0,
        "cacheKey", "avatar-42",
      )
    )
    assertEquals(mapOf("Authorization" to "Bearer t"), spec.headers)
    assertEquals(NextImageRequestFactory.PRIORITY_HIGH, spec.priority)
    assertEquals(NextImageRequestFactory.CACHE_WEB, spec.cache)
    // `web` leaves the lifetime to the server.
    assertEquals(0L, spec.ttlSeconds)
    assertEquals("avatar-42", spec.cacheKey)
  }

  @Test
  fun `converts minutes to seconds and keeps sub-minute values`() {
    val half = ok(JavaOnlyMap.of("uri", "https://example.com/a.jpg", "cacheDuration", 0.5))
    assertEquals(30L, half.ttlSeconds)
    val none = ok(JavaOnlyMap.of("uri", "https://example.com/a.jpg", "cacheDuration", 0.0))
    assertEquals(0L, none.ttlSeconds)
  }

  @Test
  fun `a blocked uri is reported with its code`() {
    val parsed = NextImageRequestFactory.parse(JavaOnlyMap.of("uri", "http://example.com/a.jpg"), config)
    assertTrue(parsed is NextImageRequestFactory.Parsed.Blocked)
    assertEquals("INSECURE_SCHEME", (parsed as NextImageRequestFactory.Parsed.Blocked).code)
  }

  @Test
  fun `a bundled asset skips the url policy`() {
    // Metro serves require()'d assets over plain http in development.
    val dev = ok(
      JavaOnlyMap.of(
        "uri", "http://10.0.2.2:8081/assets/src/logo.png?platform=android&hash=abc",
        "bundled", true,
        "headers", JavaOnlyArray.of(JavaOnlyMap.of("name", "Authorization", "value", "x")),
      )
    )
    assertTrue(dev.bundled)
    assertTrue("headers are meaningless for a bundled asset", dev.headers.isEmpty())
    assertNull(NextImageRequestFactory.localResourceName(dev))
    assertTrue(NextImageRequestFactory.isRemote(dev))

    // A release build resolves the same asset to a bare drawable name.
    val release = ok(JavaOnlyMap.of("uri", "src_logo", "bundled", true))
    assertEquals("src_logo", NextImageRequestFactory.localResourceName(release))
    assertFalse(NextImageRequestFactory.isRemote(release))

    // A file url is still a url.
    val file = ok(JavaOnlyMap.of("uri", "file:///data/app/drawable-mdpi/src_logo.png", "bundled", true))
    assertNull(NextImageRequestFactory.localResourceName(file))
  }

  @Test
  fun `only a true bundled flag counts`() {
    val parsed = NextImageRequestFactory.parse(
      JavaOnlyMap.of("uri", "src_logo", "bundled", false),
      config,
    )
    assertTrue(parsed is NextImageRequestFactory.Parsed.Blocked)
    assertEquals("MALFORMED_URI", (parsed as NextImageRequestFactory.Parsed.Blocked).code)
  }
}
