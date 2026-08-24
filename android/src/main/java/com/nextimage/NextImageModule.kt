package com.nextimage

import coil3.request.*
import coil3.Priority as CoilPriority
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise

class NextImageModule(reactContext: ReactApplicationContext) :
  NativeNextImageSpec(reactContext) {

  override fun preload(sources: ReadableArray?) {
    if (sources == null) return
    val context = reactApplicationContext
    val loader = NextImageImageLoader.getLoader(context)

    for (i in 0 until sources.size()) {
      val source = sources.getMap(i)
      val uri = if (source.hasKey("uri")) source.getString("uri") else null
      if (uri == null) continue

      val requestBuilder = ImageRequest.Builder(context)
          .data(uri)

      // Priority
      val priorityStr = if (source.hasKey("priority")) source.getString("priority") else null
      when (priorityStr) {
          "low" -> requestBuilder.priority(CoilPriority.LOW)
          "high" -> requestBuilder.priority(CoilPriority.HIGH)
          else -> requestBuilder.priority(CoilPriority.NORMAL)
      }

      loader.enqueue(requestBuilder.build())
    }
  }

  override fun clearMemoryCache(promise: Promise?) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    loader.memoryCache?.clear()
    promise?.resolve(null)
  }

  override fun clearDiskCache(promise: Promise?) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    loader.diskCache?.clear()
    promise?.resolve(null)
  }

  companion object {
    const val NAME = "NextImageModule"
  }
}
