import { describe, expect, it } from "vitest";
import { ScrollVirtualizationManager } from "../src/managers/scroll-virtualization-manager";
import { createFixedAxis } from "../src/geometry/fixed-axis";

interface HarnessOptions {
  rowCount?: number;
  rowHeight?: number;
  viewportHeight?: number;
  headerHeight?: number;
}

const createManager = (options: HarnessOptions = {}) => {
  const rowCount = options.rowCount ?? 1000;
  const rowHeight = options.rowHeight ?? 32;
  const viewportHeight = options.viewportHeight ?? 320;
  const headerHeight = options.headerHeight ?? rowHeight;
  const axis = createFixedAxis(rowCount, rowHeight);

  const manager = new ScrollVirtualizationManager({
    getHeaderHeight: () => headerHeight,
    getViewportHeight: () => viewportHeight,
    getAxis: () => axis,
  });
  return { manager, axis, rowCount, rowHeight, viewportHeight, headerHeight };
};

describe("ScrollVirtualizationManager — uncompressed", () => {
  it("caps nothing and keeps the ratio at 1", () => {
    const { manager } = createManager();
    expect(manager.updateContentSize()).toEqual({
      naturalHeight: 32_000 + 32,
      virtualHeight: 32_000 + 32,
      scrollRatio: 1,
    });
    expect(manager.isScalingActive()).toBe(false);
    expect(manager.getVirtualHeight()).toBe(32_032);
    expect(manager.getMaxLogicalScrollTop()).toBe(32_000 - 320);
    expect(manager.toLogicalScrollTop(123.5)).toBe(123.5);
    expect(manager.toDomScrollTop(123.5)).toBe(123.5);
  });

  it("keeps the mapping and content-size accessors", () => {
    const { manager } = createManager();
    manager.updateContentSize();
    expect(manager.getVirtualHeight()).toBe(32_032);
    expect(manager.getScrollRatio()).toBe(1);
  });
});

describe("ScrollVirtualizationManager — compressed", () => {
  const compressed = () =>
    createManager({ rowCount: 1_000_000, rowHeight: 32, viewportHeight: 320, headerHeight: 32 });

  it("caps the content height and computes the ratio from the axis", () => {
    const { manager } = compressed();
    const result = manager.updateContentSize();
    expect(result.naturalHeight).toBe(32_000_000 + 32);
    expect(result.virtualHeight).toBe(10_000_000);
    expect(manager.isScalingActive()).toBe(true);
    // The natural range is rounded up to the next row boundary.
    const naturalRange = Math.ceil((32_000_000 - 320) / 32) * 32;
    expect(result.scrollRatio).toBeCloseTo((10_000_000 - 32 - 320) / naturalRange, 12);
  });

  it("converts between DOM and logical scroll and clamps the maximum", () => {
    const { manager } = compressed();
    manager.updateContentSize();
    const ratio = manager.getScrollRatio();
    expect(manager.toDomScrollTop(1_000_000)).toBeCloseTo(1_000_000 * ratio, 6);
    expect(manager.toLogicalScrollTop(1_000_000 * ratio)).toBeCloseTo(1_000_000, 6);
    expect(manager.getMaxLogicalScrollTop()).toBe(32_000_000 - 320);
  });

  it("rounds the compressed natural range up through the axis", () => {
    const { manager } = createManager({
      rowCount: 400_000,
      rowHeight: 32,
      viewportHeight: 300.5,
      headerHeight: 32,
    });
    manager.updateContentSize();
    const naturalRange = 400_000 * 32 - 300.5;
    const expected = Math.ceil(naturalRange / 32) * 32;
    const virtualRange = 10_000_000 - 32 - 300.5;
    expect(manager.getScrollRatio()).toBeCloseTo(virtualRange / expected, 12);
    // The DOM end maps onto that same boundary, so the clamp never pulls back.
    expect(manager.getMaxLogicalScrollTop()).toBe(expected);
    expect(manager.toDomScrollTop(manager.getMaxLogicalScrollTop())).toBeCloseTo(virtualRange, 6);
  });

  it("recomputes the ratio when the viewport height changes", () => {
    const { manager } = compressed();
    manager.updateContentSize();
    const first = manager.getScrollRatio();
    const taller = new ScrollVirtualizationManager({
      getHeaderHeight: () => 32,
      getViewportHeight: () => 900,
      getAxis: () => createFixedAxis(1_000_000, 32),
    });
    taller.updateContentSize();
    expect(taller.getScrollRatio()).not.toBe(first);
    expect(taller.toLogicalScrollTop(500)).toBeCloseTo(500 / taller.getScrollRatio(), 6);
  });
});
