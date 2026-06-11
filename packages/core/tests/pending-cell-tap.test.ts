import { describe, expect, it, vi } from "vitest";
import type { GridCore } from "../src/grid-core";
import { PendingCellTapController } from "../src/adapter/pending-cell-tap";

const createCore = (
  confirmPendingCellTap = vi.fn(() => true),
): GridCore<unknown> => {
  const core = {
    input: {
      cancelPendingCellTap: vi.fn(),
      confirmPendingCellTap,
    },
  };
  return core as unknown as GridCore<unknown>;
};

const start = (
  controller: PendingCellTapController,
  eventInit: PointerEventInit = {},
): void => {
  controller.start(
    new PointerEvent("pointerdown", { clientX: 10, clientY: 20, ...eventInit }),
  );
};

describe("PendingCellTapController", () => {
  it("confirms the tap on pointerup within the slop", () => {
    const core = createCore();
    const onTapConfirmed = vi.fn();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: true,
      onTapConfirmed,
    });

    start(controller);
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 14, clientY: 23 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(core.input.confirmPendingCellTap).toHaveBeenCalled();
    expect(onTapConfirmed).toHaveBeenCalled();
    expect(core.input.cancelPendingCellTap).not.toHaveBeenCalled();
  });

  it("does not call onTapConfirmed when core declines the confirmation", () => {
    const core = createCore(vi.fn(() => false));
    const onTapConfirmed = vi.fn();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: true,
      onTapConfirmed,
    });

    start(controller);
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(onTapConfirmed).not.toHaveBeenCalled();
  });

  it("cancels when pointer movement exceeds the tap slop", () => {
    const core = createCore();
    const onTapConfirmed = vi.fn();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: true,
      onTapConfirmed,
    });

    start(controller);
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 10, clientY: 45 }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(core.input.cancelPendingCellTap).toHaveBeenCalled();
    expect(core.input.confirmPendingCellTap).not.toHaveBeenCalled();
    expect(onTapConfirmed).not.toHaveBeenCalled();
  });

  it("cancels on pointercancel", () => {
    const core = createCore();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: true,
      onTapConfirmed: vi.fn(),
    });

    start(controller);
    document.dispatchEvent(new PointerEvent("pointercancel"));

    expect(core.input.cancelPendingCellTap).toHaveBeenCalled();
    expect(core.input.confirmPendingCellTap).not.toHaveBeenCalled();
  });

  it("removes document listeners after confirmation", () => {
    const core = createCore();
    const onTapConfirmed = vi.fn();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: true,
      onTapConfirmed,
    });

    start(controller);
    document.dispatchEvent(new PointerEvent("pointerup"));
    document.dispatchEvent(new PointerEvent("pointerup"));
    document.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 500, clientY: 500 }),
    );

    expect(core.input.confirmPendingCellTap).toHaveBeenCalledTimes(1);
    expect(core.input.cancelPendingCellTap).not.toHaveBeenCalled();
  });

  it("does nothing outside the browser", () => {
    const core = createCore();
    const controller = new PendingCellTapController({
      getCore: () => core,
      isBrowser: false,
      onTapConfirmed: vi.fn(),
    });

    start(controller);
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(core.input.confirmPendingCellTap).not.toHaveBeenCalled();
  });
});
