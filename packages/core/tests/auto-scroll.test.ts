import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoScrollDriver } from "../src/adapter/auto-scroll";

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
