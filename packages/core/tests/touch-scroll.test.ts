import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridCore } from "../src/grid-core";
import { TouchScrollController } from "../src/adapter/touch-scroll";

interface MockCoreOptions {
  scalingActive?: boolean;
  scrollRatio?: number;
  isDragging?: boolean;
}

const createCore = (options: MockCoreOptions = {}): GridCore<unknown> => {
  const state = {
    scalingActive: options.scalingActive ?? true,
    scrollRatio: options.scrollRatio ?? 0.5,
    isDragging: options.isDragging ?? false,
  };
  const core = {
    isScalingActive: () => state.scalingActive,
    getScrollRatio: () => state.scrollRatio,
    setScrollTopOverride: vi.fn(),
    setViewport: vi.fn(),
    input: {
      getDragState: () => ({ isDragging: state.isDragging }),
    },
    __state: state,
  };
  return core as unknown as GridCore<unknown>;
};

interface MockedCore {
  setScrollTopOverride: ReturnType<typeof vi.fn>;
  setViewport: ReturnType<typeof vi.fn>;
}

const getMocks = (core: GridCore<unknown>): MockedCore =>
  core as unknown as MockedCore;

const getState = (core: GridCore<unknown>): Required<MockCoreOptions> =>
  (core as unknown as { __state: Required<MockCoreOptions> }).__state;

const createScrollEl = (): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: 10000 });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: 2000 });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: 800 });
  return el;
};

interface TouchInit {
  identifier?: number;
  clientX?: number;
  clientY?: number;
}

const touchEvent = (
  type: string,
  touches: TouchInit[],
  timeStamp = 0,
  cancelable = true,
): Event => {
  const points = touches.map((t) => ({
    identifier: t.identifier ?? 0,
    clientX: t.clientX ?? 0,
    clientY: t.clientY ?? 0,
  }));
  const event = Object.assign(
    new Event(type, { cancelable, bubbles: true }),
    { touches: points, changedTouches: points },
  );
  Object.defineProperty(event, "timeStamp", {
    configurable: true,
    value: timeStamp,
  });
  return event;
};

/** Manual rAF pump with controllable timestamps. */
const installRafPump = (): {
  pump: (now: number) => void;
  pending: () => number;
} => {
  let callbacks: Array<(now: number) => void> = [];
  let nextId = 1;
  const ids = new Map<number, (now: number) => void>();
  vi.stubGlobal("requestAnimationFrame", (cb: (now: number) => void) => {
    const id = nextId++;
    ids.set(id, cb);
    callbacks.push(cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const cb = ids.get(id);
    ids.delete(id);
    callbacks = callbacks.filter((c) => c !== cb);
  });
  return {
    pump: (now: number) => {
      const batch = callbacks;
      callbacks = [];
      batch.forEach((cb) => cb(now));
    },
    pending: () => callbacks.length,
  };
};

/**
 * Fast engaged swipe: 100 logical px in 100 ms → release velocity 1 px/ms
 * (below MAX_FLICK_VELOCITY, above MIN_FLING_VELOCITY).
 */
const fastSwipe = (el: HTMLElement): void => {
  el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
  el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 50));
  el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 100));
  el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 100));
};

describe("TouchScrollController", () => {
  let raf: ReturnType<typeof installRafPump>;

  beforeEach(() => {
    raf = installRafPump();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setup = (options: MockCoreOptions = {}) => {
    const core = createCore(options);
    const el = createScrollEl();
    const controller = new TouchScrollController({
      getCore: () => core,
      getScrollEl: () => el,
      isBrowser: true,
    });
    controller.attach();
    return { core, el, controller };
  };

  it("stays inert when scroll scaling is not active", () => {
    const { el } = setup({ scalingActive: false });
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    const move = touchEvent("touchmove", [{ clientY: 100 }], 50);
    el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("cancels moves inside the tap slop without moving content", () => {
    const { el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    const move = touchEvent("touchmove", [{ clientY: 295 }], 50);
    el.dispatchEvent(move);
    raf.pump(50);

    // preventDefault from the FIRST move — otherwise Android hands the
    // gesture to native scrolling and later cancels are silently ignored.
    expect(move.defaultPrevented).toBe(true);
    expect(el.scrollTop).toBe(0);
  });

  it("backs off when touchmove arrives non-cancelable (native scroll owns it)", () => {
    const { el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 50, false));
    // Gesture abandoned: later cancelable moves no longer scroll anything.
    const later = touchEvent("touchmove", [{ clientY: 100 }], 80);
    el.dispatchEvent(later);
    raf.pump(80);

    expect(later.defaultPrevented).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("prevents default and tracks the finger scaled by the scroll ratio", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    el.scrollTop = 1000;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    const engageMove = touchEvent("touchmove", [{ clientY: 280 }], 30);
    el.dispatchEvent(engageMove);
    const move = touchEvent("touchmove", [{ clientY: 200 }], 60);
    el.dispatchEvent(move);
    raf.pump(60);

    expect(engageMove.defaultPrevented).toBe(true);
    expect(move.defaultPrevented).toBe(true);
    // logicalDy = 100, slop offset = 20 → scrollTop = 1000 + 80 * 0.5
    expect(el.scrollTop).toBe(1040);
  });

  it("coalesces touchmove bursts into one pipeline run per frame", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 280 }], 10));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 260 }], 20));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 30));

    const mocks = getMocks(core);
    expect(mocks.setViewport).not.toHaveBeenCalled();

    raf.pump(30);
    // Only the latest position is applied: logicalDy 100 − slop 20 = 80 → 40
    expect(mocks.setViewport).toHaveBeenCalledTimes(1);
    expect(el.scrollTop).toBe(40);
  });

  it("clamps scrollTop to the scroll bounds while dragging", () => {
    const { el } = setup({ scrollRatio: 1 });
    el.scrollTop = 9400;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 280 }], 30));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: -1000 }], 60));
    raf.pump(60);

    expect(el.scrollTop).toBe(10000 - 500);
  });

  it("flings after a fast release and decays to a stop", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el);

    expect(raf.pending()).toBe(1);
    const afterRelease = el.scrollTop;
    let now = 100;
    let frames = 0;
    while (raf.pending() > 0 && frames < 2000) {
      now += 16;
      raf.pump(now);
      frames++;
    }
    expect(frames).toBeGreaterThan(1);
    expect(frames).toBeLessThan(2000);
    expect(el.scrollTop).toBeGreaterThan(afterRelease);
  });

  it("does not fling on a slow release", () => {
    const { el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 50));
    // Finger holds still well past the velocity window, then lifts.
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 300));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 350));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 360));

    expect(raf.pending()).toBe(0);
  });

  it("stops a fling when a new touch starts", () => {
    const { el } = setup();
    fastSwipe(el);
    expect(raf.pending()).toBe(1);

    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 200));
    expect(raf.pending()).toBe(0);
  });

  it("stop() cancels an in-flight fling", () => {
    const { el, controller } = setup();
    fastSwipe(el);
    controller.stop();
    expect(raf.pending()).toBe(0);
  });

  it("a wheel event stops an in-flight fling", () => {
    const { el } = setup();
    fastSwipe(el);
    expect(raf.pending()).toBe(1);

    el.dispatchEvent(new Event("wheel"));
    expect(raf.pending()).toBe(0);
  });

  it("stops the fling when it reaches the scroll bounds", () => {
    const { el } = setup({ scrollRatio: 1 });
    el.scrollTop = 9300;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 50));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 100));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 100));

    let now = 100;
    let frames = 0;
    while (raf.pending() > 0 && frames < 2000) {
      now += 16;
      raf.pump(now);
      frames++;
    }
    expect(el.scrollTop).toBe(10000 - 500);
    expect(frames).toBeLessThan(2000);
  });

  it("ignores touches that start on the fill handle", () => {
    const { el } = setup();
    const handle = document.createElement("div");
    handle.className = "gp-grid-fill-handle";
    el.appendChild(handle);

    handle.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    const move = touchEvent("touchmove", [{ clientY: 100 }], 50);
    el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("ignores a second finger while a gesture is tracked", () => {
    const { el } = setup({ scrollRatio: 1 });
    el.dispatchEvent(
      touchEvent("touchstart", [{ identifier: 1, clientY: 300 }], 0),
    );
    el.dispatchEvent(
      touchEvent("touchstart", [{ identifier: 2, clientY: 600 }], 10),
    );
    el.dispatchEvent(
      touchEvent("touchmove", [{ identifier: 1, clientY: 280 }], 30),
    );
    el.dispatchEvent(
      touchEvent("touchmove", [{ identifier: 2, clientY: 100 }], 40),
    );
    el.dispatchEvent(
      touchEvent("touchmove", [{ identifier: 1, clientY: 200 }], 60),
    );
    raf.pump(60);

    // Only finger 1 drives the scroll: logicalDy 100 − slop 20 = 80.
    expect(el.scrollTop).toBe(80);
  });

  it("abandons the gesture when a drag confirms mid-gesture", () => {
    const { core, el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 280 }], 30));
    getState(core).isDragging = true;
    const move = touchEvent("touchmove", [{ clientY: 100 }], 60);
    el.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(false);
    expect(el.scrollTop).toBe(0);
  });

  it("clears the gesture on touchcancel without flinging", () => {
    const { el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 50));
    el.dispatchEvent(touchEvent("touchcancel", [{ clientY: 250 }], 60));
    expect(raf.pending()).toBe(0);

    const before = el.scrollTop;
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 0 }], 80));
    expect(el.scrollTop).toBe(before);
  });

  it("feeds the fractional scroll position to the core during a gesture", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 280 }], 30));
    raf.pump(30);
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 279 }], 60));
    raf.pump(60);

    const mocks = getMocks(core);
    // 1 finger px past the slop offset → fractional DOM position 0.5
    expect(mocks.setScrollTopOverride).toHaveBeenLastCalledWith(0.5);
    expect(mocks.setViewport).toHaveBeenLastCalledWith(
      0.5,
      el.scrollLeft,
      el.clientWidth,
      el.clientHeight,
    );
  });

  it("releases the scroll override when the gesture ends without a fling", () => {
    const { core, el } = setup();
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 50));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 300));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 310));

    const mocks = getMocks(core);
    expect(mocks.setScrollTopOverride).toHaveBeenLastCalledWith(null);
    // The final sync re-reads the element's (quantized) scroll position.
    expect(mocks.setViewport).toHaveBeenLastCalledWith(
      el.scrollTop,
      el.scrollLeft,
      el.clientWidth,
      el.clientHeight,
    );
  });

  it("releases the scroll override when a fling decays to a stop", () => {
    const { core, el } = setup();
    fastSwipe(el);
    let now = 100;
    let frames = 0;
    while (raf.pending() > 0 && frames < 2000) {
      now += 16;
      raf.pump(now);
      frames++;
    }
    expect(getMocks(core).setScrollTopOverride).toHaveBeenLastCalledWith(null);
  });

  it("renders a fast fling every frame while the device keeps pace", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el); // release at 1 px/ms, well above RENDER_VELOCITY_THRESHOLD
    const mocks = getMocks(core);
    mocks.setViewport.mockClear();

    const before = el.scrollTop;
    let now = 100; // release rendered at t=100
    for (let i = 0; i < 7; i++) {
      now += 16;
      raf.pump(now);
    }

    // Healthy 16ms frames: every fling frame runs the full pipeline —
    // a reduced cadence at medium speed reads as freeze-and-jump stutter.
    expect(mocks.setViewport.mock.calls.length).toBe(7);
    expect(el.scrollTop).toBeGreaterThan(before);
  });

  it("falls back to throttled rendering when frames prove heavy", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el); // release rendered at t=100
    const mocks = getMocks(core);
    mocks.setViewport.mockClear();

    // Frames arrive 40ms apart (~25fps): the frame EMA exceeds the heavy
    // budget after the first measured interval and the fling latches onto
    // the FAST_FLING_RENDER_INTERVAL_MS cadence while still fast.
    const before = el.scrollTop;
    let now = 100;
    for (let i = 0; i < 6; i++) {
      now += 40;
      raf.pump(now);
    }

    // 240ms of heavy frames: far fewer pipeline runs than the 6 frames
    // pumped, while the scrollbar keeps moving every frame.
    expect(mocks.setViewport.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mocks.setViewport.mock.calls.length).toBeGreaterThan(0);
    expect(el.scrollTop).toBeGreaterThan(before);
  });

  it("renders every frame once the fling slows below the threshold", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el);
    const mocks = getMocks(core);

    // Run the fling to completion; the tail (velocity < threshold) must
    // render per frame, so the last frames each call setViewport.
    let now = 1000;
    mocks.setViewport.mockClear();
    let framesPumped = 0;
    while (raf.pending() > 0 && framesPumped < 2000) {
      now += 16;
      raf.pump(now);
      framesPumped++;
    }
    expect(framesPumped).toBeLessThan(2000);
    // Far more renders than the ~1-per-100ms throttle would allow → the
    // slow tail rendered per frame.
    expect(mocks.setViewport.mock.calls.length).toBeGreaterThan(
      Math.ceil((framesPumped * 16) / 100) + 1,
    );
  });

  it("stacks consecutive same-direction flicks up to the velocity cap", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    // First flick: release velocity clamped to 0.5 logical px/ms.
    fastSwipe(el);
    raf.pump(116); // one fling frame: scrollTop += 0.5 · 16 · 0.5 = 4

    // Catch the content mid-fling and flick again in the same direction.
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 120));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 170));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 220));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 220));

    const before = el.scrollTop;
    raf.pump(236);
    raf.pump(252);
    // release 1 + carried ≈ 0.96 ≈ 1.96 → ~15.7 px/frame, clearly above
    // the single-flick ~8 px/frame over the two pumped frames.
    expect(el.scrollTop - before).toBeGreaterThan(25);
    expect(el.scrollTop - before).toBeLessThanOrEqual(33);
  });

  it("discards carried velocity when the next flick reverses direction", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el);
    raf.pump(116); // fling is running downward

    // Flick upward: carried downward velocity must not dampen or survive.
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 120));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 350 }], 170));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 400 }], 220));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 400 }], 220));

    const before = el.scrollTop;
    raf.pump(236);
    // First frame of the reversed fling: −1 · 16 · 0.5 = −8.
    expect(el.scrollTop - before).toBeCloseTo(-8, 5);
  });

  it("governs accumulated speed down to what the renderer sustains", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    // First fling rendered at a crawl: pipeline runs 600ms apart, teaching
    // the EMA that this device renders slowly (cap → 250/600 ≈ 0.42 px/ms).
    fastSwipe(el); // renders at t=100
    raf.pump(700);
    raf.pump(1300);
    raf.pump(1900);
    raf.pump(2500);
    raf.pump(3100); // fling decays out under wall-clock time
    expect(raf.pending()).toBe(0);

    // A new flick releases at 1 px/ms, but the governor caps it at the
    // measured sustainable speed.
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 3600));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 3650));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 3700));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 3700));

    const before = el.scrollTop;
    raf.pump(3716);
    // Governed first frame: ~0.42 · 16 · 0.5 ≈ 3.3 px, below the
    // ungoverned 0.5 · 16 · 0.5 = 4 px.
    const advance = el.scrollTop - before;
    expect(advance).toBeGreaterThan(0);
    expect(advance).toBeLessThan(3.9);
  });

  it("keeps the full velocity cap when rendering keeps pace", () => {
    const { el } = setup({ scrollRatio: 0.5 });
    fastSwipe(el); // renders at t=100
    // Healthy cadence: frames every 16ms.
    for (let now = 116; now <= 360 && raf.pending() > 0; now += 16) {
      raf.pump(now);
    }
    const flung = el.scrollTop;

    // Next flick is NOT slowed down by the governor.
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 400));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 250 }], 450));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 200 }], 500));
    el.dispatchEvent(touchEvent("touchend", [{ clientY: 200 }], 500));

    const before = el.scrollTop;
    expect(before).toBeGreaterThan(flung - 1); // sanity: flush applied
    raf.pump(516);
    // Stacked velocity (release 0.5 + carried) is preserved: > 4 px/frame.
    expect(el.scrollTop - before).toBeGreaterThan(4);
  });

  it("renders every coalesced frame even when the finger moves fast", () => {
    const { core, el } = setup({ scrollRatio: 0.5 });
    const mocks = getMocks(core);
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 500 }], 0));

    // Fast drag: 80 finger px per 16ms frame (~5 px/ms). Drag rendering is
    // never throttled — content under the finger is self-limiting and a
    // reduced cadence there reads as the content sticking and jumping.
    let y = 500;
    let t = 0;
    for (let i = 0; i < 6; i++) {
      t += 16;
      y -= 80;
      el.dispatchEvent(touchEvent("touchmove", [{ clientY: y }], t));
      raf.pump(t);
    }

    expect(mocks.setViewport.mock.calls.length).toBe(6);
    // The finger position lands every frame: dy 480 − slop 80 → 200.
    expect(el.scrollTop).toBe(200);
  });

  it("sets touch policy while scaling is active and restores it on detach", () => {
    const { el, controller } = setup();
    expect(el.style.touchAction).toBe("none");
    expect(el.style.overscrollBehavior).toBe("contain");
    controller.detach();
    expect(el.style.touchAction).toBe("");
    expect(el.style.overscrollBehavior).toBe("");
  });

  it("preserves original inline touch policy on detach", () => {
    const core = createCore({ scalingActive: true });
    const el = createScrollEl();
    el.style.touchAction = "pan-y";
    el.style.overscrollBehavior = "auto";
    const controller = new TouchScrollController({
      getCore: () => core,
      getScrollEl: () => el,
      isBrowser: true,
    });
    controller.attach();

    expect(el.style.touchAction).toBe("none");
    expect(el.style.overscrollBehavior).toBe("contain");
    controller.detach();
    expect(el.style.touchAction).toBe("pan-y");
    expect(el.style.overscrollBehavior).toBe("auto");
  });

  it("keeps native touch policy when scaling is inactive", () => {
    const { el } = setup({ scalingActive: false });
    expect(el.style.touchAction).toBe("");
    expect(el.style.overscrollBehavior).toBe("");
  });

  it("re-syncs touch policy with the scaling state on touchstart", () => {
    const { core, el } = setup({ scalingActive: false });
    expect(el.style.touchAction).toBe("");
    expect(el.style.overscrollBehavior).toBe("");

    getState(core).scalingActive = true;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 0));
    expect(el.style.touchAction).toBe("none");
    expect(el.style.overscrollBehavior).toBe("contain");

    getState(core).scalingActive = false;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 100));
    expect(el.style.touchAction).toBe("");
    expect(el.style.overscrollBehavior).toBe("");
  });

  it("re-syncs touch policy with the scaling state on wheel", () => {
    const { core, el } = setup({ scalingActive: true });
    expect(el.style.touchAction).toBe("none");
    expect(el.style.overscrollBehavior).toBe("contain");

    getState(core).scalingActive = false;
    el.dispatchEvent(new Event("wheel"));
    expect(el.style.touchAction).toBe("");
    expect(el.style.overscrollBehavior).toBe("");
  });

  it("detach() removes listeners and cancels flings", () => {
    const { el, controller } = setup();
    fastSwipe(el);
    controller.detach();
    expect(raf.pending()).toBe(0);

    el.scrollTop = 0;
    el.dispatchEvent(touchEvent("touchstart", [{ clientY: 300 }], 200));
    el.dispatchEvent(touchEvent("touchmove", [{ clientY: 100 }], 250));
    expect(el.scrollTop).toBe(0);
  });
});
