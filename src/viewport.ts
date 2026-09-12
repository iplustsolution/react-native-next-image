/**
 * Shared viewport proximity tracker.
 *
 * `prefetchThreshold` is expressed as a multiple of the screen size, so a
 * threshold of `4` means "start loading once the image is within 400% of the
 * screen in front of or behind the visible area". The visible viewport itself
 * always counts, so the window an image is tested against is
 *
 *   vertical:   [-threshold * screenHeight, screenHeight * (1 + threshold)]
 *   horizontal: [-threshold * screenWidth,  screenWidth  * (1 + threshold)]
 *
 * One timer is shared by every mounted image and it only runs while at least
 * one image is still waiting to enter its window, so a list of cached images
 * settles back to zero background work.
 */

import { Dimensions } from 'react-native';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Viewport = {
  width: number;
  height: number;
};

export type Measurable = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 250;

let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

/**
 * Is `rect` (in window coordinates) inside the viewport expanded by
 * `threshold` screens in every direction?
 *
 * A non-finite or negative threshold means "always load", which is how
 * `prefetchThreshold={Infinity}` disables gating entirely.
 */
export function isNearViewport(
  rect: Rect,
  viewport: Viewport,
  threshold: number
): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) {
    return true;
  }

  const verticalMargin = viewport.height * threshold;
  const horizontalMargin = viewport.width * threshold;

  const withinVertical =
    rect.y < viewport.height + verticalMargin &&
    rect.y + rect.height > -verticalMargin;
  const withinHorizontal =
    rect.x < viewport.width + horizontalMargin &&
    rect.x + rect.width > -horizontalMargin;

  return withinVertical && withinHorizontal;
}

type Entry = {
  getNode: () => Measurable | null;
  threshold: number;
  onEnter: () => void;
  cancelled: boolean;
};

const entries = new Set<Entry>();
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function startTimer(): void {
  if (timer === null && entries.size > 0) {
    timer = setInterval(tick, pollIntervalMs);
  }
}

function measureEntry(entry: Entry): void {
  if (entry.cancelled) {
    return;
  }

  const node = entry.getNode();
  if (node == null || typeof node.measureInWindow !== 'function') {
    return;
  }

  node.measureInWindow((x, y, width, height) => {
    if (entry.cancelled) {
      return;
    }
    // A view that has not been laid out yet reports NaN on some platforms.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }

    const viewport = Dimensions.get('window');
    if (
      isNearViewport(
        { x, y, width: width || 0, height: height || 0 },
        viewport,
        entry.threshold
      )
    ) {
      entry.cancelled = true;
      entries.delete(entry);
      if (entries.size === 0) {
        stopTimer();
      }
      entry.onEnter();
    }
  });
}

function tick(): void {
  if (entries.size === 0) {
    stopTimer();
    return;
  }
  entries.forEach(measureEntry);
}

export type ViewportSubscription = {
  /** Measure immediately, e.g. from `onLayout`, instead of waiting for the next tick. */
  measureNow: () => void;
  /** Stop tracking. Safe to call more than once. */
  unsubscribe: () => void;
};

/**
 * Call `onEnter` once, as soon as the measured node is within `threshold`
 * screens of the viewport. Tracking stops automatically after it fires.
 */
export function observeViewport(
  getNode: () => Measurable | null,
  threshold: number,
  onEnter: () => void
): ViewportSubscription {
  const entry: Entry = { getNode, threshold, onEnter, cancelled: false };
  entries.add(entry);
  startTimer();
  // Measure right away so an image already on screen never waits for a tick.
  measureEntry(entry);

  return {
    measureNow: () => measureEntry(entry),
    unsubscribe: () => {
      entry.cancelled = true;
      entries.delete(entry);
      if (entries.size === 0) {
        stopTimer();
      }
    },
  };
}

/** How often pending images are re-measured, in milliseconds. */
export function setViewportPollInterval(ms: number): void {
  if (!Number.isFinite(ms) || ms < 16) {
    throw new Error('NextImage: viewport poll interval must be >= 16ms.');
  }
  pollIntervalMs = ms;
  if (timer !== null) {
    stopTimer();
    startTimer();
  }
}

export function getViewportPollInterval(): number {
  return pollIntervalMs;
}

/** Test helper: number of images still waiting to enter the viewport. */
export function getPendingViewportCount(): number {
  return entries.size;
}

/** Test helper: drop every subscription and stop the shared timer. */
export function resetViewportTracker(): void {
  entries.forEach((entry) => {
    entry.cancelled = true;
  });
  entries.clear();
  stopTimer();
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
}
