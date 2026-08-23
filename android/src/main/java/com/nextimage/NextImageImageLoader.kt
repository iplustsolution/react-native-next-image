package com.nextimage

import android.content.Context
import coil3.ImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.diskcache.DiskCache
import coil3.diskcache.directory
import coil3.memorycache.MemoryCache

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
                .logger(coil3.util.DebugLogger())
                .crossfade(true)
                .build()
        }
        return loader!!
    }
}
