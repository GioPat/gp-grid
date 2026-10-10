import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridCore } from "../src/grid-core";
import { TouchScrollController } from "../src/adapter/touch-scroll";
import { SyntheticScroll } from "../src/adapter/synthetic-scroll";
import { WHEEL_RELEASE_MS } from "../src/adapter/wheel-scroll";
import { createMotionSlot } from "./motion-slot";

const createCore = () => {
  const state = { topOverride: null as number | null };
  const setTopOverride = vi.fn((value: number | null) => {
    state.topOverride = value;
  });
  const setViewport = vi.fn();
  const core = {
    viewport: {
      isScaling: () => true,
      getScrollRatio: () => 0.2,
      getMaxFlingVelocity: () => 5,
      getRowHeight: () => 32,
      getTopOverride: () => state.topOverride,
      setTopOverride,
      ...createMotionSlot(),
    },
    setViewport,
    onBatchInstruction: () => () => {},
    input: { getDragState: () => ({ isDragging: false }) },
  };
  return { core: core as unknown as GridCore<unknown>, setTopOverride, setViewport };
};

const createScrollEl = (): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 10000 });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 });
  return el;
};

const setup = () => {
  const mocks = createCore();
  const el = createScrollEl();
  const controller = new TouchScrollController({
    getCore: () => mocks.core,
    getScrollEl: () => el,
    isBrowser: true,
  });
  controller.attach();
  return { ...mocks, el, controller };
};

const touch = (el: HTMLElement, type: string, clientY: number, timeStamp: number): void => {
  const touches = [{ identifier: 0, clientX: 0, clientY }];
  const event = Object.assign(new Event(type, { cancelable: true, bubbles: true }), {
    touches,
    changedTouches: touches,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  el.dispatchEvent(event);
};

describe("scroll motion", () => {
  let frames: Array<(now: number) => void>;
  let clock: number;
  const pump = (): void => {
    clock += 16;
    const batch = frames;
    frames = [];
    batch.forEach((callback) => callback(clock));
  };
  const reducedMotion = { matches: false };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    clock = 0;
    reducedMotion.matches = false;
    vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = [];
    });
    vi.stubGlobal("matchMedia", () => reducedMotion);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports a wheel glide only while a frame is in flight, and forgets the controller on detach", () => {
    const { core, controller } = setup();
    expect(core.viewport.isScrollMotionActive()).toBe(false);

    controller.scrollByWheel(2);
    expect(core.viewport.isScrollMotionActive()).toBe(true);
    pump();
    // Landed, but not yet released: a click here is a click, not a stop.
    expect(core.viewport.isScrollMotionActive()).toBe(false);
    vi.advanceTimersByTime(WHEEL_RELEASE_MS);
    expect(core.viewport.isScrollMotionActive()).toBe(false);

    controller.scrollByWheel(2);
    controller.detach();
    expect(core.viewport.isScrollMotionActive()).toBe(false);
  });

  it("reports a fling and stops it in place on interrupt", () => {
    const { core, el, setTopOverride } = setup();
    touch(el, "touchstart", 300, 0);
    touch(el, "touchmove", 200, 16);
    touch(el, "touchmove", 100, 32);
    touch(el, "touchend", 100, 40);
    pump();
    expect(core.viewport.isScrollMotionActive()).toBe(true);

    core.viewport.interruptScrollMotion();
    expect(core.viewport.isScrollMotionActive()).toBe(false);
    expect(setTopOverride).toHaveBeenLastCalledWith(null);
    expect(frames).toHaveLength(0);
  });

  it("drops the rest of an interrupted wheel sequence until the wheel rests", () => {
    const { core, el, controller, setViewport } = setup();
    controller.scrollByWheel(2);
    pump();
    core.viewport.interruptScrollMotion();
    setViewport.mockClear();

    for (let tick = 0; tick < 3; tick += 1) {
      vi.advanceTimersByTime(WHEEL_RELEASE_MS - 1);
      el.dispatchEvent(new Event("wheel"));
      expect(controller.scrollByWheel(2)).toBe(true);
      pump();
    }
    expect(setViewport).not.toHaveBeenCalled();
    expect(core.viewport.isScrollMotionActive()).toBe(false);

    vi.advanceTimersByTime(WHEEL_RELEASE_MS);
    controller.scrollByWheel(2);
    pump();
    expect(setViewport).toHaveBeenCalledTimes(1);
  });

  it("glides a large wheel delta over a few frames", () => {
    const { controller, setTopOverride } = setup();
    controller.scrollByWheel(10);
    pump();
    expect(setTopOverride).toHaveBeenLastCalledWith(4);
    pump();
    expect(setTopOverride).toHaveBeenLastCalledWith(8);
    pump();
    expect(setTopOverride).toHaveBeenLastCalledWith(10);
    expect(frames).toHaveLength(0);
  });

  it("holds the release until the glide lands", () => {
    const { controller, setTopOverride } = setup();
    controller.scrollByWheel(100);
    vi.advanceTimersByTime(WHEEL_RELEASE_MS);
    expect(setTopOverride).not.toHaveBeenCalledWith(null);

    while (frames.length > 0) pump();
    vi.advanceTimersByTime(WHEEL_RELEASE_MS);
    expect(setTopOverride.mock.calls.at(-2)).toEqual([100]);
    expect(setTopOverride).toHaveBeenLastCalledWith(null);
  });

  it("applies a large wheel delta at once under reduced motion", () => {
    reducedMotion.matches = true;
    const { controller, setTopOverride } = setup();
    controller.scrollByWheel(10);
    pump();
    expect(setTopOverride).toHaveBeenLastCalledWith(10);
    expect(frames).toHaveLength(0);
  });
});

describe("SyntheticScroll.release", () => {
  const releaseAt = (override: number, domTop: number): unknown => {
    const { core, setViewport } = createCore();
    const el = createScrollEl();
    const scroll = new SyntheticScroll(() => core, () => el);
    scroll.apply(core, el, override, null);
    el.scrollTop = domTop;
    scroll.release();
    return setViewport.mock.calls.at(-1)?.[0];
  };

  it("keeps the fractional top the DOM still agrees with", () => {
    expect(releaseAt(100.4, 100)).toBe(100.4);
  });

  it("follows the DOM once it moved away from the override", () => {
    expect(releaseAt(100.4, 300)).toBe(300);
  });
});
