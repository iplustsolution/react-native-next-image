package com.nextimage

import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class NextImageProgressTest {

  private lateinit var server: MockWebServer

  @Before
  fun setUp() {
    server = MockWebServer()
    server.start()
    NextImageProgressRegistry.clear()
  }

  @After
  fun tearDown() {
    NextImageProgressRegistry.clear()
    server.shutdown()
  }

  private fun client(): OkHttpClient = OkHttpClient.Builder()
    .callTimeout(10, TimeUnit.SECONDS)
    .addInterceptor(NextImageProgressInterceptor())
    .build()

  @Test
  fun `reports download progress for a listening url`() {
    val body = "x".repeat(64 * 1024)
    server.enqueue(MockResponse().setResponseCode(200).setBody(body))
    val url = server.url("/image.jpg").toString()

    var lastLoaded = 0L
    var lastTotal = 0L
    var callbacks = 0
    NextImageProgressRegistry.register(url) { loaded, total ->
      lastLoaded = loaded
      lastTotal = total
      callbacks += 1
    }

    client().newCall(Request.Builder().url(url).build()).execute().use { response ->
      response.body?.bytes()
    }

    assertTrue("expected at least one progress callback", callbacks > 0)
    assertEquals(body.length.toLong(), lastLoaded)
    assertEquals(body.length.toLong(), lastTotal)
  }

  @Test
  fun `does not wrap the body when nothing is listening`() {
    server.enqueue(MockResponse().setResponseCode(200).setBody("bytes"))
    val url = server.url("/image.jpg").toString()

    assertFalse(NextImageProgressRegistry.hasListeners(url))

    client().newCall(Request.Builder().url(url).build()).execute().use { response ->
      assertEquals("bytes", response.body?.string())
    }
  }

  @Test
  fun `unregister removes the listener`() {
    val url = "https://example.com/a.jpg"
    val listener = NextImageProgressRegistry.Listener { _, _ -> }

    NextImageProgressRegistry.register(url, listener)
    assertTrue(NextImageProgressRegistry.hasListeners(url))

    NextImageProgressRegistry.unregister(url, listener)
    assertFalse(NextImageProgressRegistry.hasListeners(url))
  }

  @Test
  fun `reports to every listener for the same url`() {
    val url = "https://example.com/a.jpg"
    var first = 0L
    var second = 0L
    NextImageProgressRegistry.register(url) { loaded, _ -> first = loaded }
    NextImageProgressRegistry.register(url) { loaded, _ -> second = loaded }

    NextImageProgressRegistry.report(url, 42, 100)

    assertEquals(42L, first)
    assertEquals(42L, second)
  }
}
