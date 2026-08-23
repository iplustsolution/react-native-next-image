package com.nextimage

import coil3.request.ImageRequest
import coil3.request.Priority
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.Promise

class NextImageModule(reactContext: ReactApplicationContext) :
  NativeNextImageSpec(reactContext) {

  override fun preload(sources: ReadableArray) {
    val context = reactApplicationContext
    val loader = NextImageImageLoader.getLoader(context)

    for (i in 0 until sources.size()) {
      val source = sources.getMap(i)
      val uri = source.getString("uri") ?: continue

      val requestBuilder = ImageRequest.Builder(context)
          .data(uri)

      // Priority
      val priorityStr = source.getString("priority")
      when (priorityStr) {
          "low" -> requestBuilder.priority(Priority.LOW)
          "high" -> requestBuilder.priority(Priority.HIGH)
          else -> requestBuilder.priority(Priority.NORMAL)
      }

      loader.enqueue(requestBuilder.build())
    }
  }

  override fun clearMemoryCache(promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    loader.memoryCache?.clear()
    promise.resolve(null)
  }

  override fun clearDiskCache(promise: Promise) {
    val loader = NextImageImageLoader.getLoader(reactApplicationContext)
    loader.diskCache?.clear()
    promise.resolve(null)
  }

  companion object {
    const val NAME = "NextImageModule"
  }
}
