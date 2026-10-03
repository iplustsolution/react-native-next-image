package com.nextimage

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.BackgroundStyleApplicator
import com.facebook.react.uimanager.LengthPercentage
import com.facebook.react.uimanager.LengthPercentageType
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.style.BorderRadiusProp
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
  override fun setDefaultSource(view: NextImageView, value: ReadableMap?) {
    view.setDefaultSource(value)
  }

  @ReactProp(name = "placeholder")
  override fun setPlaceholder(view: NextImageView, value: ReadableMap?) {
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

  /** Arrives in dp, like every other layout value from JS. */
  @ReactProp(name = "cornerRadius")
  override fun setCornerRadius(view: NextImageView, value: Float) {
    view.setBorderRadiusDp(value)
  }

  /**
   * `style.borderRadius` on the view itself. `BaseViewManager` only logs these
   * as unsupported, so without them the view ignored its own rounding on
   * Android while iOS applied it. A shared element transition animates exactly
   * this view (a copy of it, lifted out of its rounded parent), so the photo
   * flew square instead of morphing its corners. Applied like React Native's
   * own `<Image>`: the background is rounded and `onDraw` clips to it.
   */
  override fun setBorderRadius(view: NextImageView, borderRadius: Float) {
    applyBorderRadius(view, BorderRadiusProp.BORDER_RADIUS, borderRadius)
  }

  override fun setBorderTopLeftRadius(view: NextImageView, borderRadius: Float) {
    applyBorderRadius(view, BorderRadiusProp.BORDER_TOP_LEFT_RADIUS, borderRadius)
  }

  override fun setBorderTopRightRadius(view: NextImageView, borderRadius: Float) {
    applyBorderRadius(view, BorderRadiusProp.BORDER_TOP_RIGHT_RADIUS, borderRadius)
  }

  override fun setBorderBottomLeftRadius(view: NextImageView, borderRadius: Float) {
    applyBorderRadius(view, BorderRadiusProp.BORDER_BOTTOM_LEFT_RADIUS, borderRadius)
  }

  override fun setBorderBottomRightRadius(view: NextImageView, borderRadius: Float) {
    applyBorderRadius(view, BorderRadiusProp.BORDER_BOTTOM_RIGHT_RADIUS, borderRadius)
  }

  private fun applyBorderRadius(view: NextImageView, corner: BorderRadiusProp, value: Float) {
    val radius = if (value.isNaN()) null else LengthPercentage(value, LengthPercentageType.POINT)
    BackgroundStyleApplicator.setBorderRadius(view, corner, radius)
    view.invalidate()
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
