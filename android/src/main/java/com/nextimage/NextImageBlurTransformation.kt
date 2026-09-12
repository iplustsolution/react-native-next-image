package com.nextimage

import android.graphics.Bitmap
import coil3.size.Size
import coil3.transform.Transformation

/**
 * Blur for API levels below 31, where `RenderEffect` is unavailable.
 *
 * Downscaling and letting the bilinear filter smooth the result back up is
 * cheap, works on every device, and the blurred bitmap is cached under its own
 * key so the cost is paid once per radius.
 */
internal class NextImageBlurTransformation(private val radius: Int) : Transformation() {

  override val cacheKey: String = "com.nextimage.blur-$radius"

  override suspend fun transform(input: Bitmap, size: Size): Bitmap {
    if (radius <= 0) return input

    val scale = (1f / (1f + radius / 2f)).coerceIn(MIN_SCALE, 1f)
    val width = (input.width * scale).toInt().coerceAtLeast(1)
    val height = (input.height * scale).toInt().coerceAtLeast(1)
    if (width >= input.width && height >= input.height) return input

    val downscaled = Bitmap.createScaledBitmap(input, width, height, true)
    val blurred = Bitmap.createScaledBitmap(downscaled, input.width, input.height, true)
    if (downscaled !== blurred && downscaled !== input) {
      downscaled.recycle()
    }
    return blurred
  }

  private companion object {
    const val MIN_SCALE = 0.02f
  }
}
