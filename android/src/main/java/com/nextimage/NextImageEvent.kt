package com.nextimage

import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/**
 * A single event type for every NextImage callback.
 *
 * Going through [Event] and the `EventDispatcher` is what makes these work on
 * the New Architecture; `RCTEventEmitter` is not available in a bridgeless
 * runtime.
 */
internal class NextImageEvent(
  surfaceId: Int,
  viewTag: Int,
  private val name: String,
  private val payload: WritableMap?,
  private val coalesce: Boolean = false,
) : Event<NextImageEvent>(surfaceId, viewTag) {

  override fun getEventName(): String = name

  override fun getEventData(): WritableMap? = payload

  override fun canCoalesce(): Boolean = coalesce

  companion object {
    const val LOAD_START = "topNextImageLoadStart"
    const val PROGRESS = "topNextImageProgress"
    const val LOAD = "topNextImageLoad"
    const val ERROR = "topNextImageError"
    const val LOAD_END = "topNextImageLoadEnd"

    val ALL = listOf(LOAD_START, PROGRESS, LOAD, ERROR, LOAD_END)

    /** `topNextImageLoad` -> `onNextImageLoad`, the prop name JS binds to. */
    fun propNameFor(eventName: String): String = "on" + eventName.removePrefix("top")
  }
}
