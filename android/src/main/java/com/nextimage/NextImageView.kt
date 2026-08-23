package com.nextimage

import android.content.Context
import android.graphics.PorterDuff
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import androidx.appcompat.widget.AppCompatImageView
import coil3.request.ImageRequest
import coil3.request.crossfade
import coil3.request.transformations
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import coil3.request.CachePolicy
import coil3.request.Priority
import coil3.size.Scale
import coil3.request.target
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import coil3.transform.CircleCropTransformation
import coil3.transform.RoundedCornersTransformation
import coil3.request.placeholder
import coil3.request.error
import coil3.request.ProgressListener
import android.view.animation.AlphaAnimation
import android.view.animation.ScaleAnimation
import android.view.animation.TranslateAnimation
import android.view.animation.Animation
import coil3.request.allowHardware
import android.os.Build
import android.graphics.RenderEffect
import android.graphics.Shader

class NextImageView(context: Context) : AppCompatImageView(context) {
    private var source: ReadableMap? = null
    private var defaultSource: String? = null
    private var resizeMode: String = "cover"
    private var blurRadius: Int = 0
    private var transition: String = "none"
    private var tintColor: Int? = null
    private var transitionDuration: Int = 300
    private var borderRadius: Float = 0f
    private var isCircle: Boolean = false
    private var downsample: Boolean = true
    private var grayscale: Boolean = false
    private var placeholderUrl: String? = null

    fun setSource(source: ReadableMap?) {
        this.source = source
        reloadImage()
    }

    fun setDefaultSource(defaultSource: String?) {
        this.defaultSource = defaultSource
        reloadImage()
    }

    fun setResizeMode(resizeMode: String) {
        this.resizeMode = resizeMode
        when (resizeMode) {
            "contain" -> scaleType = ScaleType.FIT_CENTER
            "cover" -> scaleType = ScaleType.CENTER_CROP
            "stretch" -> scaleType = ScaleType.FIT_XY
            "center" -> scaleType = ScaleType.CENTER_INSIDE
        }
        reloadImage()
    }

    fun setBlurRadius(blurRadius: Int) {
        this.blurRadius = blurRadius
        reloadImage()
    }

    fun setTransition(transition: String) {
        this.transition = transition
        reloadImage()
    }

    fun setTintColor(tintColor: Int?) {
        this.tintColor = tintColor
        applyFilters()
    }

    fun setTransitionDuration(duration: Int) {
        this.transitionDuration = duration
        reloadImage()
    }

    fun setBorderRadius(radius: Float) {
        this.borderRadius = radius
        reloadImage()
    }

    fun setIsCircle(isCircle: Boolean) {
        this.isCircle = isCircle
        reloadImage()
    }

    fun setDownsample(downsample: Boolean) {
        this.downsample = downsample
        reloadImage()
    }

    fun setGrayscale(grayscale: Boolean) {
        this.grayscale = grayscale
        applyFilters()
    }

    fun setPlaceholder(placeholder: String?) {
        this.placeholderUrl = placeholder
        reloadImage()
    }

    private fun applyFilters() {
        // Grayscale + Tint
        if (grayscale) {
            val matrix = ColorMatrix()
            matrix.setSaturation(0f)
            val filter = ColorMatrixColorFilter(matrix)
            colorFilter = filter
        } else if (tintColor != null) {
            setColorFilter(tintColor!!, PorterDuff.Mode.SRC_IN)
        } else {
            clearColorFilter()
        }

        // Blur (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (blurRadius > 0) {
                setRenderEffect(RenderEffect.createBlurEffect(blurRadius.toFloat(), blurRadius.toFloat(), Shader.TileMode.CLAMP))
            } else {
                setRenderEffect(null)
            }
        }
    }

    private fun reloadImage() {
        val uri = source?.getString("uri")
        val loader = NextImageImageLoader.getLoader(context)

        if (uri == null) {
            if (defaultSource != null) {
                val request = ImageRequest.Builder(context)
                    .data(defaultSource)
                    .target(this)
                    .build()
                loader.enqueue(request)
            } else {
                setImageDrawable(null)
            }
            return
        }

        val requestBuilder = ImageRequest.Builder(context)
            .data(uri)
            .allowHardware(true)
            .target(
                onStart = {
                    sendEvent("onNextImageLoadStart", null)
                },
                onSuccess = { result ->
                    setImageDrawable(result)
                    applyFilters()
                    applyCustomTransition()
                    val eventData = Arguments.createMap()
                    eventData.putDouble("width", result.intrinsicWidth.toDouble())
                    eventData.putDouble("height", result.intrinsicHeight.toDouble())
                    sendEvent("onNextImageLoad", eventData)
                    sendEvent("onNextImageLoadEnd", null)
                },
                onError = { error ->
                    if (defaultSource != null) {
                         val defaultRequest = ImageRequest.Builder(context)
                            .data(defaultSource)
                            .target(this@NextImageView)
                            .build()
                        loader.enqueue(defaultRequest)
                    }
                    val eventData = Arguments.createMap()
                    eventData.putString("error", error.toString())
                    sendEvent("onNextImageError", eventData)
                    sendEvent("onNextImageLoadEnd", null)
                }
            )
            .progressListener { loaded, total ->
                if (total > 0) {
                    val eventData = Arguments.createMap()
                    eventData.putInt("loaded", loaded.toInt())
                    eventData.putInt("total", total.toInt())
                    sendEvent("onNextImageProgress", eventData)
                }
            }

        // Headers
        source?.getArray("headers")?.let { headers ->
            for (i in 0 until headers.size()) {
                val header = headers.getMap(i)
                val name = header.getString("name")
                val value = header.getString("value")
                if (name != null && value != null) {
                    requestBuilder.addHeader(name, value)
                }
            }
        }

        // Cache Duration (TTL)
        val cacheDuration = if (source?.hasKey("cacheDuration") == true) {
            source?.getDouble("cacheDuration") ?: 10080.0
        } else {
            10080.0
        }
        val maxAgeSeconds = (cacheDuration * 60).toLong()
        requestBuilder.addHeader("Cache-Control", "max-age=$maxAgeSeconds")

        // Priority
        val priorityStr = source?.getString("priority")
        when (priorityStr) {
            "low" -> requestBuilder.priority(Priority.LOW)
            "high" -> requestBuilder.priority(Priority.HIGH)
            else -> requestBuilder.priority(Priority.NORMAL)
        }

        // Cache Control
        val cacheStr = source?.getString("cache")
        when (cacheStr) {
            "immutable" -> {
                requestBuilder.memoryCachePolicy(CachePolicy.ENABLED)
                requestBuilder.diskCachePolicy(CachePolicy.ENABLED)
            }
            "cacheOnly" -> {
                requestBuilder.networkCachePolicy(CachePolicy.DISABLED)
            }
            else -> {
                requestBuilder.memoryCachePolicy(CachePolicy.ENABLED)
                requestBuilder.diskCachePolicy(CachePolicy.ENABLED)
            }
        }

        // Native Coil Crossfade
        if (transition == "fade") {
            requestBuilder.crossfade(transitionDuration)
        }

        // Transformations
        val transforms = mutableListOf<coil3.transform.Transformation>()
        if (isCircle) {
            transforms.add(CircleCropTransformation())
        } else if (borderRadius > 0) {
            transforms.add(RoundedCornersTransformation(borderRadius))
        }

        if (transforms.isNotEmpty()) {
            requestBuilder.transformations(transforms)
        }

        // Resize Mode
        when (resizeMode) {
            "contain" -> requestBuilder.scale(Scale.FIT)
            "cover" -> requestBuilder.scale(Scale.FILL)
        }

        // Downsampling
        if (!downsample) {
            requestBuilder.size(coil3.size.Size.ORIGINAL)
            requestBuilder.precision(coil3.request.Precision.EXACT)
        }

        loader.enqueue(requestBuilder.build())
    }

    private fun applyCustomTransition() {
        val animation: Animation? = when (transition) {
            "slide" -> {
                TranslateAnimation(0f, 0f, 100f, 0f).apply {
                    duration = transitionDuration.toLong()
                }
            }
            "scale" -> {
                ScaleAnimation(0.8f, 1f, 0.8f, 1f, Animation.RELATIVE_TO_SELF, 0.5f, Animation.RELATIVE_TO_SELF, 0.5f).apply {
                    duration = transitionDuration.toLong()
                }
            }
            "gravity" -> {
                TranslateAnimation(0f, 0f, -height.toFloat(), 0f).apply {
                    duration = transitionDuration.toLong()
                    interpolator = android.view.animation.OvershootInterpolator()
                }
            }
            else -> null
        }
        animation?.let { startAnimation(it) }
    }

    private fun sendEvent(eventName: String, data: WritableMap?) {
        val reactContext = context as ThemedReactContext
        val eventDispatcher = reactContext.getJSModule(RCTEventEmitter::class.java)
        eventDispatcher.receiveEvent(id, eventName, data)
    }
}
