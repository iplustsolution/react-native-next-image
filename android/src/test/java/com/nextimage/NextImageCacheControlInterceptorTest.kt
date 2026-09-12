package com.nextimage

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * The interceptor is what makes "download once" true even when the server asks
 * for the opposite, so it is tested against a real HTTP exchange.
 */
class NextImageCacheControlInterceptorTest {

  private lateinit var server: MockWebServer
  private var respectServerHeaders = false

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
    respectServerHeaders = false
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun client(): OkHttpClient = OkHttpClient.Builder()
    .callTimeout(10, TimeUnit.SECONDS)
    .addInterceptor(NextImageCacheControlInterceptor { respectServerHeaders })
    .build()

  private fun get(ttlSeconds: String?): okhttp3.Response {
    val builder = Request.Builder().url(server.url("/image.jpg"))
    if (ttlSeconds != null) {
      builder.header(TTL_HEADER, ttlSeconds)
    }
    return client().newCall(builder.build()).execute()
  }

  @Test
  fun `rewrites a no-store response into a cacheable one`() {
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
        .setHeader("Pragma", "no-cache")
        .setHeader("Expires", "0")
        .setHeader("Vary", "Accept")
        .setHeader("ETag", "\"abc\"")
        .setBody("image-bytes")
    )

    get("3600").use { response ->
      assertEquals("public, max-age=3600", response.header("Cache-Control"))
      assertNull(response.header("Pragma"))
      assertNull(response.header("Expires"))
      assertNull(response.header("Vary"))
      // Kept so that revalidation after expiry can still answer 304.
      assertEquals("\"abc\"", response.header("ETag"))
    }
  }

  @Test
  fun `marks a long lifetime immutable`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("bytes"))

    get((60L * 60 * 24 * 400).toString()).use { response ->
      assertEquals(
        "public, max-age=34560000, immutable",
        response.header("Cache-Control"),
      )
    }
  }

  @Test
  fun `strips the internal ttl header before the request leaves the device`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("bytes"))

    get("120").close()

    val recorded = server.takeRequest()
    assertNull(recorded.getHeader(TTL_HEADER))
  }

  @Test
  fun `leaves the response alone when the app opts into server cache headers`() {
    respectServerHeaders = true
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setHeader("Cache-Control", "no-store")
        .setBody("bytes")
    )

    get("3600").use { response ->
      assertEquals("no-store", response.header("Cache-Control"))
    }
  }

  @Test
  fun `leaves the response alone without a ttl header`() {
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setHeader("Cache-Control", "max-age=30")
        .setBody("bytes")
    )

    get(null).use { response ->
      assertEquals("max-age=30", response.header("Cache-Control"))
    }
  }

  @Test
  fun `does not make an error response look cacheable`() {
    server.enqueue(
      MockResponse()
        .setResponseCode(404)
        .setHeader("Cache-Control", "no-store")
        .setBody("missing")
    )

    get("3600").use { response ->
      assertEquals(404, response.code)
      assertEquals("no-store", response.header("Cache-Control"))
    }
  }

  @Test
  fun `treats a zero or negative ttl as server controlled`() {
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setHeader("Cache-Control", "no-store")
        .setBody("bytes")
    )

    get("0").use { response ->
      assertEquals("no-store", response.header("Cache-Control"))
    }
  }
}
