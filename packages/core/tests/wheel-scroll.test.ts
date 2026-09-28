import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridCore } from "../src/grid-core";
import { TouchScrollController } from "../src/adapter/touch-scroll";
import { WHEEL_RELEASE_MS } from "../src/adapter/wheel-scroll";

const createCore = (scaling = true, topOverride: number | null = null) => {
  const state = { topOverride };
  const setTopOverride = vi.fn((value: number | null) => {
    state.topOverride = value;
  });
  const setViewport = vi.fn();
  const core = {
    viewport: {
      isScaling: () => scaling,
      getScrollRatio: () => 0.2,
      getMaxFlingVelocity: () => 5,
      getRowHeight: () => 32,
      getTopOverride: () => state.topOverride,
      setTopOverride,
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

const setup = (scaling = true, topOverride: number | null = null) => {
  const mocks = createCore(scaling, topOverride);
  const el = createScrollEl();
  const controller = new TouchScrollController({
    getCore: () => mocks.core,
    getScrollEl: () => el,
    isBrowser: true,
  });
  controller.attach();
  return { ...mocks, el, controller };
};

describe("TouchScrollController — dampened wheel", () => {
  let frames: Array<(now: number) => void>;
  const pump = (now: number): void => {
    const batch = frames;
    frames = [];
    batch.forEach((callback) => callback(now));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps sub-pixel deltas the DOM would round away", () => {
    const { controller, setTopOverride } = setup();
    for (let tick = 0; tick < 10; tick += 1) controller.scrollByWheel(0.3);
    pump(16);

    expect(setTopOverride).toHaveBeenLastCalledWith(expect.closeTo(3, 6));
  });

  it("runs one pipeline per frame however many events arrive", () => {
    const { controller, setViewport } = setup();
    for (let tick = 0; tick < 5; tick += 1) controller.scrollByWheel(2);
    expect(setViewport).not.toHaveBeenCalled();

    pump(16);
    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]![0]).toBe(10);
  });

  it("hands the top back to native scroll once the wheel is idle", () => {
    const { controller, el, setTopOverride } = setup();
    controller.scrollByWheel(4);
    pump(16);
    vi.advanceTimersByTime(WHEEL_RELEASE_MS - 1);
    expect(setTopOverride).not.toHaveBeenLastCalledWith(null);

    // The wheel listener itself must not release a sequence in flight.
    el.dispatchEvent(new Event("wheel"));
    controller.scrollByWheel(4);
    vi.advanceTimersByTime(WHEEL_RELEASE_MS - 1);
    expect(setTopOverride).not.toHaveBeenLastCalledWith(null);

    vi.advanceTimersByTime(1);
    expect(setTopOverride).toHaveBeenLastCalledWith(null);
  });

  it("clamps the accumulated top to the scroll range", () => {
    const { controller, setTopOverride } = setup();
    controller.scrollByWheel(-20);
    pump(16);
    expect(setTopOverride).toHaveBeenLastCalledWith(0);

    controller.scrollByWheel(20_000);
    pump(32);
    expect(setTopOverride).toHaveBeenLastCalledWith(9500);
  });

  it("releases at once on a wheel when the grid is not scaled", () => {
    const { controller, el, setTopOverride } = setup(false);
    controller.scrollByWheel(4);
    pump(16);
    el.dispatchEvent(new Event("wheel"));
    expect(setTopOverride).toHaveBeenLastCalledWith(null);
  });

  it("continues from a top override the DOM still agrees with", () => {
    const { controller, el, setTopOverride } = setup(true, 100.4);
    el.scrollTop = 100;
    controller.scrollByWheel(2);
    pump(16);

    expect(setTopOverride).toHaveBeenLastCalledWith(expect.closeTo(102.4, 6));
  });

  it("restarts from the DOM top when the override is stale", () => {
    const { controller, el, setTopOverride } = setup(true, 400);
    el.scrollTop = 100;
    controller.scrollByWheel(2);
    pump(16);

    expect(setTopOverride).toHaveBeenLastCalledWith(102);
  });

  it("applies at once without requestAnimationFrame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { controller, setViewport } = setup();
    controller.scrollByWheel(3);

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(setViewport.mock.calls[0]![0]).toBe(3);
  });

  it("releases without re-applying a top the frame already applied", () => {
    const { controller, setTopOverride } = setup();
    controller.scrollByWheel(4);
    pump(16);
    vi.advanceTimersByTime(WHEEL_RELEASE_MS);

    expect(setTopOverride.mock.calls).toEqual([[4], [null]]);
  });
});
