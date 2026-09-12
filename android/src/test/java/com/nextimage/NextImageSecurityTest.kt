package com.nextimage

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NextImageSecurityTest {

  private val defaults = NextImageConfig()

  private fun blockedCode(uri: String, config: NextImageConfig = defaults): String? =
    when (val result = NextImageSecurity.validateUri(uri, config)) {
      is NextImageSecurity.UriResult.Blocked -> result.code
      is NextImageSecurity.UriResult.Allowed -> null
    }

  @Test
  fun `allows https urls`() {
    assertEquals(null, blockedCode("https://images.example.com/a.jpg?v=2"))
  }

  @Test
  fun `blocks plain http unless opted in`() {
    assertEquals("INSECURE_SCHEME", blockedCode("http://images.example.com/a.jpg"))
    assertEquals(
      null,
      blockedCode(
        "http://images.example.com/a.jpg",
        defaults.copy(allowInsecureHttp = true, blockPrivateNetworks = false),
      ),
    )
  }

  @Test
  fun `blocks unknown schemes`() {
    assertEquals("SCHEME_NOT_ALLOWED", blockedCode("javascript:alert(1)"))
    assertEquals("SCHEME_NOT_ALLOWED", blockedCode("ftp://example.com/a.jpg"))
  }

  @Test
  fun `blocks data and file urls unless opted in`() {
    assertEquals("DATA_URI_NOT_ALLOWED", blockedCode("data:image/png;base64,AAAA"))
    assertEquals("FILE_URI_NOT_ALLOWED", blockedCode("file:///tmp/a.jpg"))
    assertEquals(
      null,
      blockedCode("data:image/png;base64,AAAA", defaults.copy(allowDataUri = true)),
    )
    assertEquals(null, blockedCode("file:///tmp/a.jpg", defaults.copy(allowFileUri = true)))
  }

  @Test
  fun `blocks embedded credentials`() {
    assertEquals("URI_CREDENTIALS", blockedCode("https://user:secret@example.com/a.jpg"))
    assertEquals(
      null,
      blockedCode(
        "https://user:secret@example.com/a.jpg",
        defaults.copy(allowUriCredentials = true),
      ),
    )
  }

  @Test
  fun `blocks control characters used for request splitting`() {
    assertEquals(
      "CONTROL_CHARACTERS",
      blockedCode("https://example.com/a.jpg\r\nX-Injected: 1"),
    )
  }

  @Test
  fun `blocks empty and malformed uris`() {
    assertEquals("EMPTY_URI", blockedCode(""))
    assertEquals("EMPTY_URI", blockedCode("   "))
    assertEquals("MALFORMED_URI", blockedCode("not-a-uri"))
    assertEquals("HOST_MISSING", blockedCode("https:///a.jpg"))
  }

  @Test
  fun `blocks private and metadata hosts by default`() {
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://localhost/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://127.0.0.1/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://10.1.2.3/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://192.168.1.1/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://172.16.0.1/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://169.254.169.254/latest"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://[::1]/a.jpg"))
    assertEquals("PRIVATE_HOST_BLOCKED", blockedCode("https://metadata.google.internal/x"))
  }

  @Test
  fun `allows public addresses`() {
    assertFalse(NextImageSecurity.isPrivateHost("8.8.8.8"))
    assertFalse(NextImageSecurity.isPrivateHost("172.32.0.1"))
    assertFalse(NextImageSecurity.isPrivateHost("example.com"))
    assertTrue(NextImageSecurity.isPrivateHost("172.31.255.255"))
  }

  @Test
  fun `honours host allow and block lists`() {
    val allowOnly = defaults.copy(allowedHosts = listOf("*.cdn.example.com"))
    assertEquals(null, blockedCode("https://img.cdn.example.com/a.jpg", allowOnly))
    assertEquals(null, blockedCode("https://cdn.example.com/a.jpg", allowOnly))
    assertEquals("HOST_NOT_ALLOWED", blockedCode("https://evil.example.com/a.jpg", allowOnly))

    val blocked = defaults.copy(blockedHosts = listOf("tracker.example.com"))
    assertEquals("HOST_BLOCKED", blockedCode("https://tracker.example.com/a.jpg", blocked))

    // A block list entry wins over an allow list entry.
    val both = defaults.copy(
      allowedHosts = listOf("*.example.com"),
      blockedHosts = listOf("tracker.example.com"),
    )
    assertEquals("HOST_BLOCKED", blockedCode("https://tracker.example.com/a.jpg", both))
  }

  @Test
  fun `parses authority components`() {
    val parsed = NextImageSecurity.parseUri("https://user@Images.Example.com:8443/a/b.jpg?x=1#f")
    requireNotNull(parsed)
    assertEquals("https", parsed.scheme)
    assertEquals("user", parsed.userInfo)
    assertEquals("images.example.com", parsed.host)
    assertEquals(8443, parsed.port)
    assertEquals("/a/b.jpg", parsed.path)
    assertEquals("x=1", parsed.query)
  }

  @Test
  fun `drops headers that could split a request`() {
    val result = NextImageSecurity.sanitizeHeaders(
      listOf(
        "Authorization" to "Bearer token",
        "X-Bad" to "value\r\nX-Injected: 1",
        "Bad Name" to "value",
        "Host" to "evil.example.com",
        "Content-Length" to "0",
        "X-Ok" to "fine",
      ),
      defaults,
    )

    assertEquals(mapOf("Authorization" to "Bearer token", "X-Ok" to "fine"), result.headers)
    assertEquals(listOf("X-Bad", "Bad Name", "Host", "Content-Length"), result.rejected)
  }

  @Test
  fun `caps the number of headers`() {
    val many = (1..30).map { "X-H$it" to "v$it" }
    val result = NextImageSecurity.sanitizeHeaders(many, defaults.copy(maxHeaderCount = 5))
    assertEquals(5, result.headers.size)
    assertEquals(25, result.rejected.size)
  }

  @Test
  fun `caps header name and value length`() {
    val config = defaults.copy(maxHeaderNameLength = 8, maxHeaderValueLength = 4)
    val result = NextImageSecurity.sanitizeHeaders(
      listOf("X-Very-Long-Name" to "v", "X-Ok" to "toolong"),
      config,
    )
    assertTrue(result.headers.isEmpty())
    assertEquals(2, result.rejected.size)
  }

  @Test
  fun `redacts credentials and query strings`() {
    assertEquals(
      "https://example.com/a.jpg?<redacted>",
      NextImageSecurity.redactUri("https://user:pw@example.com/a.jpg?token=secret"),
    )
    assertEquals("data:<redacted>", NextImageSecurity.redactUri("data:image/png;base64,AAAA"))
    assertEquals("<invalid-uri>", NextImageSecurity.redactUri("::::"))
  }

  @Test
  fun `caps the size of a data uri`() {
    val config = defaults.copy(allowDataUri = true, maxDataUriBytes = 10)
    assertEquals(
      "DATA_URI_TOO_LARGE",
      blockedCode("data:image/png;base64,${"A".repeat(200)}", config),
    )
    assertEquals(null, blockedCode("data:image/png;base64,AAAA", config))
  }
}
