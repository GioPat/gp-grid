import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoScrollDriver } from "../src/adapter/auto-scroll";
import {
  AUTO_SCROLL_SPEED,
  AUTO_SCROLL_THRESHOLD,
  calculateAutoScroll,
} from "../src/input/auto-scroll-util";

describe("AutoScrollDriver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("scrolls the body and replays the last pointer event on each tick", () => {
    const body = document.createElement("div");
    const pointerEvent = new PointerEvent("pointermove");
    const onTick = vi.fn();
    const driver = new AutoScrollDriver(() => body, onTick);

    driver.recordPointer(pointerEvent);
    driver.start(3, 4);
    vi.advanceTimersByTime(16);

    expect(body.scrollLeft).toBe(3);
    expect(body.scrollTop).toBe(4);
    expect(onTick).toHaveBeenCalledWith(pointerEvent);

    driver.stop();
  });

  it("does not replay a pointer event after it is cleared", () => {
    const body = document.createElement("div");
    const onTick = vi.fn();
    const driver = new AutoScrollDriver(() => body, onTick);

    driver.recordPointer(new PointerEvent("pointermove"));
    driver.clearPointer();
    driver.start(1, 2);
    vi.advanceTimersByTime(16);

    expect(body.scrollLeft).toBe(1);
    expect(body.scrollTop).toBe(2);
    expect(onTick).not.toHaveBeenCalled();

    driver.stop();
  });

  it("skips scrolling when there is no body element", () => {
    const onTick = vi.fn();
    const driver = new AutoScrollDriver(() => null, onTick);

    driver.recordPointer(new PointerEvent("pointermove"));
    driver.start(1, 1);
    vi.advanceTimersByTime(16);

    expect(onTick).not.toHaveBeenCalled();

    driver.stop();
  });
});

interface Region {
  frozenExtent: number;
  suffixViewportHeight: number;
}

const LIMITS = { scrollTop: 100, maxScrollTop: 900 };
const WIDTH = 300;

const dyAt = (y: number, region: Region, containerHeight: number, scrollTop = LIMITS.scrollTop) =>
  calculateAutoScroll(y, WIDTH / 2, containerHeight, WIDTH, region, {
    scrollTop,
    maxScrollTop: LIMITS.maxScrollTop,
  })?.dy ?? 0;

describe("calculateAutoScroll — region zones", () => {
  const cases = [0, 32].flatMap((frozenExtent) =>
    [0, 32, 64, 80, 120].map((suffixViewportHeight) => ({ frozenExtent, suffixViewportHeight })),
  );

  it.each(cases)(
    "resolves the zones for extent $frozenExtent and suffix $suffixViewportHeight",
    ({ frozenExtent, suffixViewportHeight }) => {
      const containerHeight = frozenExtent + suffixViewportHeight;
      const region = { frozenExtent, suffixViewportHeight };
      if (suffixViewportHeight === 0) {
        expect(dyAt(0, region, containerHeight)).toBe(0);
        expect(dyAt(containerHeight, region, containerHeight)).toBe(0);
        return;
      }
      const edge = Math.min(AUTO_SCROLL_THRESHOLD, suffixViewportHeight / 2);
      expect(dyAt(frozenExtent + edge - 1, region, containerHeight)).toBe(-AUTO_SCROLL_SPEED);
      expect(dyAt(frozenExtent + edge, region, containerHeight)).toBe(0);
      expect(dyAt(containerHeight - edge, region, containerHeight)).toBe(0);
      expect(dyAt(containerHeight - edge + 1, region, containerHeight)).toBe(AUTO_SCROLL_SPEED);
    },
  );

  it("is neutral at the midpoint of a 64 px suffix", () => {
    const region = { frozenExtent: 0, suffixViewportHeight: 64 };
    expect(dyAt(31, region, 64)).toBe(-AUTO_SCROLL_SPEED);
    expect(dyAt(32, region, 64)).toBe(0);
    expect(dyAt(33, region, 64)).toBe(AUTO_SCROLL_SPEED);
  });

  it("keeps the direction of pointers beyond the body", () => {
    const region = { frozenExtent: 96, suffixViewportHeight: 224 };
    expect(dyAt(-1, region, 320)).toBe(-AUTO_SCROLL_SPEED);
    expect(dyAt(0, region, 320)).toBe(-AUTO_SCROLL_SPEED);
    expect(dyAt(320, region, 320)).toBe(AUTO_SCROLL_SPEED);
    expect(dyAt(10_000, region, 320)).toBe(AUTO_SCROLL_SPEED);
  });

  it("suppresses the vertical axis alone when the suffix is empty", () => {
    const region = { frozenExtent: 320, suffixViewportHeight: 0 };
    expect(
      calculateAutoScroll(310, 10, 320, WIDTH, region, LIMITS),
    ).toEqual({ dx: -AUTO_SCROLL_SPEED, dy: 0 });
    expect(calculateAutoScroll(310, WIDTH / 2, 320, WIDTH, region, LIMITS)).toBeNull();
  });

  it("suppresses the vertical axis alone when the axis cannot scroll", () => {
    const region = { frozenExtent: 0, suffixViewportHeight: 320 };
    const limits = { scrollTop: 0, maxScrollTop: 0 };
    expect(
      calculateAutoScroll(310, 10, 320, WIDTH, region, limits),
    ).toEqual({ dx: -AUTO_SCROLL_SPEED, dy: 0 });
    expect(calculateAutoScroll(310, WIDTH / 2, 320, WIDTH, region, limits)).toBeNull();
  });

  it("stops the up step at the top and the down step at the maximum", () => {
    const region = { frozenExtent: 0, suffixViewportHeight: 320 };
    expect(dyAt(10, region, 320, 0)).toBe(0);
    expect(dyAt(310, region, 320, 0)).toBe(AUTO_SCROLL_SPEED);
    expect(dyAt(310, region, 320, 900)).toBe(0);
    expect(dyAt(10, region, 320, 900)).toBe(-AUTO_SCROLL_SPEED);
  });
});
