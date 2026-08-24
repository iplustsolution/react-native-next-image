package com.nextimage

import coil3.request.ImageRequest
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray

class NextImageModule(reactContext: ReactApplicationContext) :
  NativeNextImageModuleSpec(reactContext) {

  override fun getName() = NAME

  override fun preload(sources: ReadableArray) {
    val context = reactApplicationContext
    val loader = NextImageImageLoader.getLoader(context)

    for (i in 0 until sources.size()) {
      val source = sources.getMap(i) ?: continue
      val uri = if (source.hasKey("uri")) source.getString("uri") else null
      if (uri == null) continue

      val request = ImageRequest.Builder(context).data(uri).build()
      loader.enqueue(request)
    }
  }

  override fun clearMemoryCache(promise: Promise) {
    NextImageImageLoader.getLoader(reactApplicationContext).memoryCache?.clear()
    promise.resolve(null)
  }

  override fun clearDiskCache(promise: Promise) {
    NextImageImageLoader.getLoader(reactApplicationContext).diskCache?.clear()
    promise.resolve(null)
  }

  companion object {
    const val NAME = "NextImageModule"
  }
}