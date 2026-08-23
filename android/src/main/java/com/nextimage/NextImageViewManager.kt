package com.nextimage

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.common.MapBuilder

class NextImageViewManager : SimpleViewManager<NextImageView>() {
    override fun getName(): String = "NextImageView"

    override fun createViewInstance(reactContext: ThemedReactContext): NextImageView {
        return NextImageView(reactContext)
    }

    @ReactProp(name = "source")
    fun setSource(view: NextImageView, source: ReadableMap?) {
        view.setSource(source)
    }

    @ReactProp(name = "defaultSource")
    fun setDefaultSource(view: NextImageView, defaultSource: String?) {
        view.setDefaultSource(defaultSource)
    }

    @ReactProp(name = "resizeMode")
    fun setResizeMode(view: NextImageView, resizeMode: String?) {
        view.setResizeMode(resizeMode ?: "cover")
    }

    @ReactProp(name = "blurRadius")
    fun setBlurRadius(view: NextImageView, blurRadius: Int) {
        view.setBlurRadius(blurRadius)
    }

    @ReactProp(name = "transition")
    fun setTransition(view: NextImageView, transition: String?) {
        view.setTransition(transition ?: "none")
    }

    @ReactProp(name = "tintColor", customType = "Color")
    fun setTintColor(view: NextImageView, tintColor: Int?) {
        view.setTintColor(tintColor)
    }

    @ReactProp(name = "transitionDuration")
    fun setTransitionDuration(view: NextImageView, duration: Int) {
        view.setTransitionDuration(duration)
    }

    @ReactProp(name = "borderRadius")
    fun setBorderRadius(view: NextImageView, radius: Float) {
        view.setBorderRadius(radius)
    }

    @ReactProp(name = "isCircle")
    fun setIsCircle(view: NextImageView, isCircle: Boolean) {
        view.setIsCircle(isCircle)
    }

    @ReactProp(name = "downsample")
    fun setDownsample(view: NextImageView, downsample: Boolean) {
        view.setDownsample(downsample)
    }

    @ReactProp(name = "grayscale")
    fun setGrayscale(view: NextImageView, grayscale: Boolean) {
        view.setGrayscale(grayscale)
    }

    @ReactProp(name = "placeholder")
    fun setPlaceholder(view: NextImageView, placeholder: String?) {
        view.setPlaceholder(placeholder)
    }

    override fun getExportedCustomBubblingEventTypeConstants(): Map<String, Any> {
        return MapBuilder.builder<String, Any>()
            .put("onNextImageLoadStart", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onNextImageLoadStart")))
            .put("onNextImageProgress", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onNextImageProgress")))
            .put("onNextImageLoad", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onNextImageLoad")))
            .put("onNextImageError", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onNextImageError")))
            .put("onNextImageLoadEnd", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onNextImageLoadEnd")))
            .build()
    }
}
