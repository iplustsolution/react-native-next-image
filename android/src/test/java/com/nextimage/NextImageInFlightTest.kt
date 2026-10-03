package com.nextimage

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class NextImageInFlightTest {

  @Test
  fun `runs fetches for one key one at a time`() = runBlocking {
    val running = AtomicInteger(0)
    val peak = AtomicInteger(0)
    (1..5).map {
      async {
        NextImageInFlight.withKey("https://cdn.example.com/a.jpg") {
          peak.accumulateAndGet(running.incrementAndGet(), ::maxOf)
          delay(20)
          running.decrementAndGet()
        }
      }
    }.awaitAll()
    assertEquals(1, peak.get())
    assertEquals(0, NextImageInFlight.size())
  }

  @Test
  fun `lets different keys run together`() = runBlocking {
    val running = AtomicInteger(0)
    val peak = AtomicInteger(0)
    (1..3).map { index ->
      async {
        NextImageInFlight.withKey("https://cdn.example.com/$index.jpg") {
          peak.accumulateAndGet(running.incrementAndGet(), ::maxOf)
          delay(50)
          running.decrementAndGet()
        }
      }
    }.awaitAll()
    assertEquals(3, peak.get())
  }

  @Test
  fun `releases the key when the fetch fails`() = runBlocking {
    runCatching {
      NextImageInFlight.withKey("https://cdn.example.com/broken.jpg") { error("boom") }
    }
    assertEquals(0, NextImageInFlight.size())
  }
}
