package com.nextimage

import android.content.Context
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.request.crossfade

object NextImageImageLoader {
    private var loader: ImageLoader? = null

    fun getLoader(context: Context): ImageLoader {
        if (loader == null) {
            loader = ImageLoader.Builder(context)
                .components {
                    add(OkHttpNetworkFetcherFactory())
                }
                .memoryCache {
                    MemoryCache.Builder()
                        .maxSizePercent(context, 0.25)
                        .strongReferencesEnabled(true)
                        .build()
                }
                .diskCache {
                    DiskCache.Builder()
                        .directory(context.cacheDir.resolve("next_image_cache"))
                        .maxSizeBytes(100L * 1024 * 1024) // 100MB
                        .build()
                }
                .crossfade(true)
                .build()
        }
        return loader!!
    }
}
