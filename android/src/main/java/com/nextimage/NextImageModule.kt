package com.nextimage

import com.facebook.react.bridge.ReactApplicationContext

class NextImageModule(reactContext: ReactApplicationContext) :
  NativeNextImageSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeNextImageSpec.NAME
  }
}
