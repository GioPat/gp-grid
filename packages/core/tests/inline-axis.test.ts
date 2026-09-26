// packages/core/tests/inline-axis.test.ts
// The inline-axis contract: core geometry is inline-start relative and the
// adapter helpers are the only place a physical x is normalized.

import { describe, expect, it, vi } from "vitest";
import {
  fixedLeftForInline,
  inlineOffset,
  normalizeHorizontalKey,
  readContainerBounds,
  readIsRtl,
  toInlineX,
  toPhysicalX,
} from "../src/adapter/inline-axis";
import { AutoScrollDriver } from "../src/adapter/auto-scroll";
import { TouchScrollController } from "../src/adapter/touch-scroll";
import { computeDragTarget, createGestureState } from "../src/adapter/touch-gesture";
import { ColumnResizeDrag } from "../src/input/column-resize-drag";
import { computeCellTarget } from "../src/input/cell-target";
import { createClientDataSource } from "../src/data-source";
import { GridCore } from "../src/grid-core";
import { scrollCellIntoView } from "../src/utils/scroll-helpers";
import type { ColumnDefinition } from "../src/types";
import type { ContainerBounds, PointerEventData } from "../src/types/input";

interface Row {
  id: number;
  a: string;
  b: string;
  c: string;
}

const column = (field: string, width: number): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width,
});

const createGrid = (): GridCore<Row> =>
  new GridCore<Row>({
    columns: [column("id", 100), column("a", 100), column("b", 100), column("c", 100)],
    dataSource: createClientDataSource(
      Array.from({ length: 5 }, (_, index) => ({
        id: index,
        a: `a${index}`,
        b: `b${index}`,
        c: `c${index}`,
      })),
    ),
    rowHeight: 32,
  });

const pointer = (clientX: number, clientY = 16): PointerEventData => ({
  clientX,
  clientY,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

const bounds = (overrides?: Partial<ContainerBounds>): ContainerBounds => ({
  top: 0,
  left: 0,
  width: 300,
  height: 320,
  scrollTop: 0,
  scrollLeft: 0,
  rtl: true,
  ...overrides,
});

/** Force the direction an element's computed style reports. */
const withDirection = <T>(rtl: boolean, run: () => T): T => {
  const spy = vi
    .spyOn(window, "getComputedStyle")
    .mockReturnValue({ direction: rtl ? "rtl" : "ltr" } as CSSStyleDeclaration);
  try {
    return run();
  } finally {
    spy.mockRestore();
  }
};

describe("inline axis helpers", () => {
  it("flips physical x in RTL and leaves LTR alone", () => {
    expect(toInlineX(40, false)).toBe(40);
    expect(toInlineX(40, true)).toBe(-40);
    expect(toPhysicalX(40, false)).toBe(40);
    expect(toPhysicalX(-40, true)).toBe(40);
  });

  it("measures the inline offset from the client box's inline start", () => {
    expect(inlineOffset(bounds({ rtl: false, left: 10, width: 200 }), 60)).toBe(50);
    expect(inlineOffset(bounds({ rtl: true, left: 10, width: 200 }), 60)).toBe(150);
  });

  it("reports the client box with inline-relative scroll", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 240 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(el, "clientTop", { configurable: true, value: 1 });
    Object.defineProperty(el, "clientLeft", { configurable: true, value: 2 });
    el.getBoundingClientRect = () =>
      ({ top: 10, left: 20, width: 260, height: 140 }) as DOMRect;

    const ltr = withDirection(false, () => readContainerBounds(el));
    expect(ltr).toMatchObject({ top: 11, left: 22, width: 240, height: 120, rtl: false });

    el.scrollLeft = -30;
    el.scrollTop = 7;
    const rtl = withDirection(true, () => readContainerBounds(el));
    expect(rtl).toMatchObject({ rtl: true, scrollLeft: 30, scrollTop: 7 });
  });

  it("places fixed overlays at the physical edge the inline start maps to", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 200 });
    el.getBoundingClientRect = () => ({ top: 0, left: 10, width: 200, height: 100 }) as DOMRect;

    expect(withDirection(false, () => fixedLeftForInline(el, 30, 20))).toBe(40);
    expect(withDirection(true, () => fixedLeftForInline(el, 30, 20))).toBe(160);
  });

  it("defaults to LTR without a DOM", () => {
    expect(readIsRtl(null)).toBe(false);
    expect(readIsRtl(undefined)).toBe(false);
  });

  it("points horizontal arrows at the side they point at", () => {
    expect(normalizeHorizontalKey("ArrowLeft", true)).toBe("ArrowRight");
    expect(normalizeHorizontalKey("ArrowRight", true)).toBe("ArrowLeft");
    expect(normalizeHorizontalKey("ArrowLeft", false)).toBe("ArrowLeft");
    expect(normalizeHorizontalKey("ArrowRight", false)).toBe("ArrowRight");
    expect(normalizeHorizontalKey("ArrowUp", true)).toBe("ArrowUp");
    expect(normalizeHorizontalKey("Tab", true)).toBe("Tab");
  });
});

describe("region-aware input in RTL", () => {
  it("maps a mirrored pointer to the column under it", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);

    // Inline offsets 0..300 run right to left on screen.
    expect(computeCellTarget(grid, pointer(250), bounds()).col).toBe(0);
    expect(computeCellTarget(grid, pointer(50), bounds()).col).toBe(2);

    grid.setViewport(0, 100, 300, 320);
    const scrolled = bounds({ scrollLeft: 100 });
    expect(computeCellTarget(grid, pointer(250), scrolled).col).toBe(1);
    expect(computeCellTarget(grid, pointer(50), scrolled).col).toBe(3);
  });

  it("auto-scrolls toward the edge the pointer sits on", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);

    const atInlineStart = computeCellTarget(grid, pointer(290), bounds());
    const atInlineEnd = computeCellTarget(grid, pointer(10), bounds());
    expect(atInlineStart.autoScroll?.dx).toBe(-10);
    expect(atInlineEnd.autoScroll?.dx).toBe(10);
  });

  it("grows a column when the resize handle is dragged toward the inline end", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const drag = new ColumnResizeDrag(grid);

    drag.start(1, 100, pointer(200));
    drag.move(pointer(160), bounds());
    expect(drag.getState()?.currentWidth).toBe(140);

    drag.start(1, 100, pointer(200));
    drag.move(pointer(160), bounds({ rtl: false }));
    expect(drag.getState()?.currentWidth).toBe(60);
  });
});

describe("inline-relative scroll writes", () => {
  it("clamps RTL touch drags to the negative DOM range", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 100 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 400 });
    el.scrollLeft = -50;

    withDirection(true, () => {
      const gesture = createGestureState({ identifier: 1, clientX: 0, clientY: 0 }, el, 0, 0);
      expect(gesture.rtl).toBe(true);
      // Finger left by 100 px, well past the inline start: clamp to 0.
      expect(computeDragTarget(gesture, el, 1, 100, 0).left).toBe(0);
      // Finger right by 1000 px: clamp to the far end of the negative range.
      expect(computeDragTarget(gesture, el, 1, -1000, 0).left).toBe(-300);
    });
  });

  it("applies logical auto-scroll deltas as physical DOM writes", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    el.scrollLeft = -50;
    const driver = new AutoScrollDriver(() => el, () => {});

    withDirection(true, () => driver.start(-10, 4));
    vi.advanceTimersByTime(16);
    expect(el.scrollLeft).toBe(-40);
    expect(el.scrollTop).toBe(4);

    driver.stop();
    vi.useRealTimers();
  });

  it("writes a scroll target in the DOM's own sign", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 150, 320);
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 150 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 320 });

    withDirection(true, () => scrollCellIntoView(grid, el, 0, 2));
    // Column 2 spans inline offsets 200..300: the target is 150.
    expect(el.scrollLeft).toBe(-150);

    withDirection(false, () => scrollCellIntoView(grid, el, 0, 2));
    expect(el.scrollLeft).toBe(150);
  });

  it("reads the DOM sample back into inline space", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 320 });
    el.scrollLeft = -40;

    // A 40 px inline-relative sample means column 0 is fully visible.
    withDirection(true, () => scrollCellIntoView(grid, el, 0, 0, { scrollLeft: -40 }));
    expect(el.scrollLeft).toBe(0);
  });
});

describe("synthetic-scroll direction", () => {
  const createHarness = () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 4000 });
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 10000 });
    const core = {
      viewport: {
        isScaling: () => true,
        getScrollRatio: () => 1,
        getMaxFlingVelocity: () => 5,
        getRowHeight: () => 32,
        setTopOverride: vi.fn(),
      },
      setViewport: vi.fn(),
      onBatchInstruction: () => () => {},
      input: { getDragState: () => ({ isDragging: false }) },
    } as unknown as GridCore<unknown>;
    const controller = new TouchScrollController({
      getCore: () => core,
      getScrollEl: () => el,
      isBrowser: true,
    });
    controller.attach();
    return { core, el, controller };
  };

  /** A vertical swipe long enough to engage, applied synchronously on release. */
  const verticalSwipe = (el: HTMLElement): void => {
    const send = (type: string, y: number): void => {
      const touches = [{ identifier: 1, clientX: 200, clientY: y }];
      el.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          touches,
          changedTouches: touches,
        }),
      );
    };
    send("touchstart", 300);
    send("touchmove", 200);
    send("touchend", 200);
  };

  const logicalScrolls = (core: GridCore<unknown>): unknown[] =>
    (core as unknown as { setViewport: ReturnType<typeof vi.fn> }).setViewport.mock.calls
      .map((call) => call[1]);

  it("reports inline-relative scroll with the direction resampled on resize", () => {
    const { core, el, controller } = createHarness();
    el.scrollLeft = -100;
    withDirection(true, () => verticalSwipe(el));

    // The host flips to LTR and resizes: wrappers resample `dir` and drop the
    // bridge cache before the next touch.
    el.scrollLeft = 100;
    controller.resetDirection();
    withDirection(false, () => verticalSwipe(el));

    expect(logicalScrolls(core)).not.toContain(-100);
    expect(logicalScrolls(core).at(-1)).toBe(100);
  });

  it("agrees with the gesture direction without a wrapper resample", () => {
    const { core, el } = createHarness();
    el.scrollLeft = -100;
    withDirection(true, () => verticalSwipe(el));

    el.scrollLeft = 100;
    withDirection(false, () => verticalSwipe(el));

    // -100 is what the stale cache reports for a DOM +100, and core would
    // correct the jump; the gesture's own sample must win.
    expect(logicalScrolls(core)).not.toContain(-100);
  });
});
