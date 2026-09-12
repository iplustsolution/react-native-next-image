package com.nextimage

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.NextImageViewManagerDelegate
import com.facebook.react.viewmanagers.NextImageViewManagerInterface

/**
 * Implements the codegen interface so props flow through the generated
 * delegate on the New Architecture, and keeps the `@ReactProp` annotations so
 * the reflection based path of the old architecture works too.
 */
@ReactModule(name = NextImageViewManager.NAME)
class NextImageViewManager :
  SimpleViewManager<NextImageView>(),
  NextImageViewManagerInterface<NextImageView> {

  private val managerDelegate: ViewManagerDelegate<NextImageView> =
    NextImageViewManagerDelegate(this)

  override fun getName(): String = NAME

  override fun getDelegate(): ViewManagerDelegate<NextImageView> = managerDelegate

  override fun createViewInstance(reactContext: ThemedReactContext): NextImageView =
    NextImageView(reactContext)

  /** Every prop for this transaction has been applied: load at most once. */
  override fun onAfterUpdateTransaction(view: NextImageView) {
    super.onAfterUpdateTransaction(view)
    view.commitProps()
  }

  override fun onDropViewInstance(view: NextImageView) {
    view.cleanup()
    super.onDropViewInstance(view)
  }

  @ReactProp(name = "source")
  override fun setSource(view: NextImageView, value: ReadableMap?) {
    view.setSource(value)
  }

  @ReactProp(name = "defaultSource")
  override fun setDefaultSource(view: NextImageView, value: String?) {
    view.setDefaultSource(value)
  }

  @ReactProp(name = "placeholder")
  override fun setPlaceholder(view: NextImageView, value: String?) {
    view.setPlaceholder(value)
  }

  @ReactProp(name = "resizeMode")
  override fun setResizeMode(view: NextImageView, value: String?) {
    view.setResizeMode(value)
  }

  @ReactProp(name = "tintColor", customType = "Color")
  override fun setTintColor(view: NextImageView, value: Int?) {
    view.setTintColorValue(value)
  }

  @ReactProp(name = "blurRadius")
  override fun setBlurRadius(view: NextImageView, value: Int) {
    view.setBlurRadius(value)
  }

  @ReactProp(name = "transition")
  override fun setTransition(view: NextImageView, value: String?) {
    view.setTransition(value)
  }

  @ReactProp(name = "transitionDuration", defaultInt = 300)
  override fun setTransitionDuration(view: NextImageView, value: Int) {
    view.setTransitionDuration(value)
  }

  @ReactProp(name = "borderRadius")
  override fun setBorderRadius(view: NextImageView, value: Float) {
    view.setBorderRadiusPx(value)
  }

  @ReactProp(name = "isCircle")
  override fun setIsCircle(view: NextImageView, value: Boolean) {
    view.setCircleCrop(value)
  }

  @ReactProp(name = "downsample", defaultBoolean = true)
  override fun setDownsample(view: NextImageView, value: Boolean) {
    view.setDownsample(value)
  }

  @ReactProp(name = "grayscale")
  override fun setGrayscale(view: NextImageView, value: Boolean) {
    view.setGrayscale(value)
  }

  @ReactProp(name = "deferNetwork")
  override fun setDeferNetwork(view: NextImageView, value: Boolean) {
    view.setDeferNetwork(value)
  }

  @ReactProp(name = "retryCount", defaultInt = 2)
  override fun setRetryCount(view: NextImageView, value: Int) {
    view.setRetryCount(value)
  }

  @ReactProp(name = "retryDelay", defaultInt = 1000)
  override fun setRetryDelay(view: NextImageView, value: Int) {
    view.setRetryDelay(value)
  }

  override fun getExportedCustomBubblingEventTypeConstants(): MutableMap<String, Any> {
    val constants = mutableMapOf<String, Any>()
    for (eventName in NextImageEvent.ALL) {
      constants[eventName] = mapOf(
        "phasedRegistrationNames" to mapOf(
          "bubbled" to NextImageEvent.propNameFor(eventName)
        )
      )
    }
    return constants
  }

  companion object {
    const val NAME = "NextImageView"
  }
}
