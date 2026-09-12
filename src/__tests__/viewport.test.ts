import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Dimensions } from 'react-native';

import {
  getPendingViewportCount,
  getViewportPollInterval,
  isNearViewport,
  observeViewport,
  resetViewportTracker,
  setViewportPollInterval,
  type Measurable,
} from '../viewport';

const viewport = { width: 400, height: 800 };

/** A node whose measured position the test controls. */
function fakeNode(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { node: Measurable; move: (y: number) => void } {
  const current = { ...rect };
  return {
    node: {
      measureInWindow: (callback) => {
        callback(current.x, current.y, current.width, current.height);
      },
    },
    move: (y: number) => {
      current.y = y;
    },
  };
}

afterEach(() => {
  resetViewportTracker();
  jest.restoreAllMocks();
});

describe('isNearViewport', () => {
  it('counts the visible viewport at a threshold of zero', () => {
    expect(
      isNearViewport({ x: 0, y: 0, width: 400, height: 100 }, viewport, 0)
    ).toBe(true);
    expect(
      isNearViewport({ x: 0, y: 799, width: 400, height: 100 }, viewport, 0)
    ).toBe(true);
    expect(
      isNearViewport({ x: 0, y: 800, width: 400, height: 100 }, viewport, 0)
    ).toBe(false);
    expect(
      isNearViewport({ x: 0, y: -100, width: 400, height: 100 }, viewport, 0)
    ).toBe(false);
  });

  it('extends the window by 400% of the screen at a threshold of 4', () => {
    // Downwards: the window ends at 800 + 4 * 800 = 4000.
    expect(
      isNearViewport({ x: 0, y: 3999, width: 400, height: 10 }, viewport, 4)
    ).toBe(true);
    expect(
      isNearViewport({ x: 0, y: 4000, width: 400, height: 10 }, viewport, 4)
    ).toBe(false);

    // Upwards: the window starts at -4 * 800 = -3200.
    expect(
      isNearViewport({ x: 0, y: -3201, width: 400, height: 10 }, viewport, 4)
    ).toBe(true);
    expect(
      isNearViewport({ x: 0, y: -3300, width: 400, height: 10 }, viewport, 4)
    ).toBe(false);
  });

  it('scales the window with the threshold', () => {
    const rect = { x: 0, y: 1500, width: 400, height: 100 };
    expect(isNearViewport(rect, viewport, 0)).toBe(false);
    expect(isNearViewport(rect, viewport, 1)).toBe(true);
  });

  it('applies the same rule horizontally', () => {
    expect(
      isNearViewport({ x: 1999, y: 0, width: 10, height: 10 }, viewport, 4)
    ).toBe(true);
    expect(
      isNearViewport({ x: 2000, y: 0, width: 10, height: 10 }, viewport, 4)
    ).toBe(false);
  });

  it('never gates when the threshold is not a finite positive number', () => {
    const far = { x: 0, y: 999999, width: 10, height: 10 };
    expect(isNearViewport(far, viewport, Number.POSITIVE_INFINITY)).toBe(true);
    expect(isNearViewport(far, viewport, Number.NaN)).toBe(true);
    expect(isNearViewport(far, viewport, -1)).toBe(true);
  });
});

describe('observeViewport', () => {
  it('fires immediately for a node that is already in range', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);
    const onEnter = jest.fn();
    const { node } = fakeNode({ x: 0, y: 100, width: 400, height: 200 });

    observeViewport(() => node, 4, onEnter);

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(getPendingViewportCount()).toBe(0);
  });

  it('keeps a far node pending and fires once it moves into range', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);
    const onEnter = jest.fn();
    const { node, move } = fakeNode({
      x: 0,
      y: 90000,
      width: 400,
      height: 200,
    });

    const subscription = observeViewport(() => node, 4, onEnter);
    expect(onEnter).not.toHaveBeenCalled();
    expect(getPendingViewportCount()).toBe(1);

    move(500);
    subscription.measureNow();

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(getPendingViewportCount()).toBe(0);
  });

  it('fires at most once', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);
    const onEnter = jest.fn();
    const { node } = fakeNode({ x: 0, y: 0, width: 400, height: 200 });

    const subscription = observeViewport(() => node, 4, onEnter);
    subscription.measureNow();
    subscription.measureNow();

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('stops tracking on unsubscribe', () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);
    const onEnter = jest.fn();
    const { node, move } = fakeNode({
      x: 0,
      y: 90000,
      width: 400,
      height: 200,
    });

    const subscription = observeViewport(() => node, 4, onEnter);
    subscription.unsubscribe();
    expect(getPendingViewportCount()).toBe(0);

    move(0);
    subscription.measureNow();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('tolerates a node that is not mounted yet', () => {
    const onEnter = jest.fn();
    const subscription = observeViewport(() => null, 4, onEnter);
    expect(onEnter).not.toHaveBeenCalled();
    expect(getPendingViewportCount()).toBe(1);
    subscription.unsubscribe();
  });

  it('ignores a measurement that has not resolved to real coordinates', () => {
    const onEnter = jest.fn();
    const node: Measurable = {
      measureInWindow: (callback) => {
        callback(Number.NaN, Number.NaN, 0, 0);
      },
    };

    observeViewport(() => node, 4, onEnter);
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('re-measures every pending node on the shared timer', () => {
    jest.useFakeTimers();
    jest.spyOn(Dimensions, 'get').mockReturnValue(viewport as never);

    const first = fakeNode({ x: 0, y: 90000, width: 400, height: 100 });
    const second = fakeNode({ x: 0, y: 90000, width: 400, height: 100 });
    const onFirst = jest.fn();
    const onSecond = jest.fn();

    setViewportPollInterval(100);
    observeViewport(() => first.node, 4, onFirst);
    observeViewport(() => second.node, 4, onSecond);
    expect(getPendingViewportCount()).toBe(2);

    first.move(0);
    jest.advanceTimersByTime(100);

    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(onSecond).not.toHaveBeenCalled();
    expect(getPendingViewportCount()).toBe(1);

    second.move(0);
    jest.advanceTimersByTime(100);
    expect(onSecond).toHaveBeenCalledTimes(1);
    expect(getPendingViewportCount()).toBe(0);

    // Nothing left to measure, so the shared timer stops on its own.
    jest.advanceTimersByTime(1000);
    expect(jest.getTimerCount()).toBe(0);

    jest.useRealTimers();
  });
});

describe('setViewportPollInterval', () => {
  it('rejects an interval faster than a frame', () => {
    expect(() => setViewportPollInterval(0)).toThrow(/>= 16ms/);
    expect(() => setViewportPollInterval(Number.NaN)).toThrow(/>= 16ms/);
  });

  it('applies a valid interval', () => {
    setViewportPollInterval(500);
    expect(getViewportPollInterval()).toBe(500);
  });
});
