package com.nextimage

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * `prefetchThreshold` and `cache: 'cacheOnly'` depend on a cache-only request
 * never opening a connection, so this is checked against a real server.
 */
class NextImageOnlyIfCachedInterceptorTest {

  private lateinit var server: MockWebServer

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
  }

  @After
  fun tearDown() {
    server.shutdown()
  }

  private fun client(): OkHttpClient = OkHttpClient.Builder()
    .callTimeout(10, TimeUnit.SECONDS)
    .addInterceptor(NextImageOnlyIfCachedInterceptor())
    .build()

  @Test
  fun `answers a cache-only request locally with a tagged 504`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("bytes"))

    val request = Request.Builder()
      .url(server.url("/image.jpg"))
      // What Coil sends when the network cache policy is disabled.
      .header("Cache-Control", "only-if-cached, max-stale=2147483647")
      .build()

    client().newCall(request).execute().use { response ->
      assertEquals(NextImageOnlyIfCachedInterceptor.UNSATISFIABLE_STATUS, response.code)
      assertNotNull(response.header(UNSATISFIABLE_HEADER))
    }
    assertEquals("the server must not see the request", 0, server.requestCount)
  }

  @Test
  fun `lets every other request through untouched`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("bytes"))

    val request = Request.Builder()
      .url(server.url("/image.jpg"))
      .header("Cache-Control", "no-cache")
      .build()

    client().newCall(request).execute().use { response ->
      assertEquals(200, response.code)
      assertNull(response.header(UNSATISFIABLE_HEADER))
      assertEquals("bytes", response.body?.string())
    }
    assertEquals(1, server.requestCount)
  }
}
