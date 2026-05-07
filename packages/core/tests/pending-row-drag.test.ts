import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridCore } from "../src/grid-core";
import { PendingRowDragController } from "../src/adapter/pending-row-drag";
import type { DragState } from "../src/types";

const dragState: DragState = {
  isDragging: true,
  dragType: "row-drag",
  fillSourceRange: null,
  fillTarget: null,
  columnResize: null,
  columnMove: null,
  rowDrag: {
    sourceRowIndex: 1,
    currentX: 10,
    currentY: 20,
    dropTargetIndex: null,
    dropIndicatorY: 0,
  },
};

const createCore = (
  confirmPendingRowDrag = vi.fn(() => true),
): GridCore<unknown> => {
  const core = {
    input: {
      cancelPendingRowDrag: vi.fn(),
      confirmPendingRowDrag,
      getDragState: vi.fn(() => dragState),
    },
  };
  return core as unknown as GridCore<unknown>;
};

const startFromElement = (
  controller: PendingRowDragController,
  target: HTMLElement,
  eventInit: PointerEventInit = {},
): void => {
  target.addEventListener(
    "pointerdown",
    (event) => controller.start(event),
    { once: true },
  );
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: 10,
      clientY: 20,
      pointerId: 5,
      ...eventInit,
    }),
  );
};

describe("PendingRowDragController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("confirms pending row drag after the hold delay", () => {
    const container = document.createElement("div");
    container.style.overflow = "auto";
    const target = document.createElement("div");
    const setPointerCapture = vi.fn<(pointerId: number) => void>();
    Object.defineProperty(target, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    const onDragConfirmed = vi.fn();
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => container,
      isBrowser: true,
      onDragConfirmed,
    });

    startFromElement(controller, target);
    vi.advanceTimersByTime(300);

    expect(core.input.confirmPendingRowDrag).toHaveBeenCalled();
    expect(container.style.overflow).toBe("hidden");
    expect(setPointerCapture).toHaveBeenCalledWith(5);
    expect(onDragConfirmed).toHaveBeenCalledWith(dragState);

    controller.releaseLocks();

    expect(container.style.overflow).toBe("auto");
  });

  it("cancels pending row drag when pointer movement exceeds the threshold", () => {
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => document.createElement("div"),
      isBrowser: true,
      onDragConfirmed: vi.fn(),
    });

    startFromElement(controller, document.createElement("div"));
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 25,
        clientY: 20,
      }),
    );
    vi.advanceTimersByTime(300);

    expect(core.input.cancelPendingRowDrag).toHaveBeenCalled();
    expect(core.input.confirmPendingRowDrag).not.toHaveBeenCalled();
  });

  it("cancels pending row drag when pointer is released before the hold delay", () => {
    const core = createCore();
    const controller = new PendingRowDragController({
      getCore: () => core,
      getContainer: () => document.createElement("div"),
      isBrowser: true,
      onDragConfirmed: vi.fn(),
    });

    startFromElement(controller, document.createElement("div"));
    document.dispatchEvent(new PointerEvent("pointerup"));
    vi.advanceTimersByTime(300);

    expect(core.input.cancelPendingRowDrag).toHaveBeenCalled();
    expect(core.input.confirmPendingRowDrag).not.toHaveBeenCalled();
  });

  it("does not release container locks outside the browser", () => {
    const container = document.createElement("div");
    container.style.overflow = "hidden";
    const controller = new PendingRowDragController({
      getCore: () => null,
      getContainer: () => container,
      isBrowser: false,
      onDragConfirmed: vi.fn(),
    });

    controller.releaseLocks();

    expect(container.style.overflow).toBe("hidden");
  });
});
