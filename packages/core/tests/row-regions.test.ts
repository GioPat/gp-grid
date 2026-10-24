import { describe, expect, it } from "vitest";
import { createFixedAxis } from "../src/geometry/fixed-axis";
import { createPrefixAxis } from "../src/geometry/prefix-axis";
import {
  DEFAULT_MAX_FROZEN_ROWS,
  UNMEASURED_VIEWPORT_HEIGHT,
  resolveFrozenRows,
  resolveRowRegionLayout,
  type FrozenRowsInput,
  type RowRegionLayout,
} from "../src/geometry/row-regions";
import { hitTestRowRegion } from "../src/geometry/row-regions-mapping";
import { ViewportState } from "../src/managers/viewport-state";
import { createHarness, frameInput } from "./row-regions-harness";

const input = (overrides: Partial<FrozenRowsInput> = {}): FrozenRowsInput => ({
  axis: createFixedAxis(1000, 32),
  requestedCount: 3,
  viewportHeight: 600,
  viewportMeasured: true,
  ...overrides,
});

const admitsUpTo = (max: number) => (count: number): boolean => count <= max;
const rejectsAll = (): boolean => false;

describe("frozen row resolution", () => {
  it("resolves requested counts 0/1/3/all/out-of-range", () => {
    expect(resolveFrozenRows(input({ requestedCount: 0 })))
      .toEqual({ requestedCount: 0, effectiveCount: 0, limit: null });
    expect(resolveFrozenRows(input({ requestedCount: 1 })).effectiveCount).toBe(1);
    expect(resolveFrozenRows(input({ requestedCount: 3 })))
      .toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });
    const all = resolveFrozenRows(input({ axis: createFixedAxis(4, 32), requestedCount: 4 }));
    expect(all).toEqual({ requestedCount: 4, effectiveCount: 4, limit: null });
    const beyond = resolveFrozenRows(input({ axis: createFixedAxis(4, 32), requestedCount: 99 }));
    expect(beyond).toEqual({ requestedCount: 99, effectiveCount: 4, limit: null });
  });

  it("covers display indices [0, n) with the frozen band", () => {
    const harness = createHarness({ rowCount: 1000, rowHeight: 32, viewportHeight: 600, overscan: 0 });
    for (const count of [1, 3]) {
      const layout = resolveRowRegionLayout(input({
        axis: harness.axis,
        requestedCount: count,
        viewportHeight: 600,
      }));
      const mapping = frameInput(harness, { frozenCount: count });
      expect(layout.frozenCount).toBe(count);
      expect(layout.frozenExtent).toBe(harness.axis.getOffset(count));
      expect(hitTestRowRegion(mapping, layout.frozenExtent - 1))
        .toEqual({ rowIndex: count - 1, rowRegion: "frozen" });
      expect(hitTestRowRegion(mapping, layout.frozenExtent))
        .toEqual({ rowIndex: count, rowRegion: "suffix" });
    }
  });

  it("applies each limit in order and reports the last one", () => {
    expect(resolveFrozenRows(input({ requestedCount: 5, maxCount: 2 })))
      .toEqual({ requestedCount: 5, effectiveCount: 2, limit: "maxCount" });
    expect(resolveFrozenRows(input({ requestedCount: 5, viewportHeight: 100 })))
      .toEqual({ requestedCount: 5, effectiveCount: 1, limit: "viewport" });
    expect(resolveFrozenRows(input({ requestedCount: 5, admitsPrefix: admitsUpTo(2) })))
      .toEqual({ requestedCount: 5, effectiveCount: 2, limit: "cache" });
    expect(resolveFrozenRows(input({ requestedCount: 5, admitsPrefix: rejectsAll })))
      .toEqual({ requestedCount: 5, effectiveCount: 0, limit: "cache" });
    const chained = resolveFrozenRows(input({
      requestedCount: 5,
      maxCount: 2,
      viewportHeight: 100,
      admitsPrefix: rejectsAll,
    }));
    expect(chained).toEqual({ requestedCount: 5, effectiveCount: 0, limit: "cache" });
  });

  it("keeps the default maxCount cap", () => {
    const resolved = resolveFrozenRows(input({ requestedCount: 5000, viewportHeight: 100_000 }));
    expect(resolved.effectiveCount).toBe(DEFAULT_MAX_FROZEN_ROWS);
    expect(resolved.limit).toBe("maxCount");
  });

  it("honours a configured positive minSuffixHeight", () => {
    const options = { requestedCount: 5, viewportHeight: 200 };
    expect(resolveFrozenRows(input(options)))
      .toEqual({ requestedCount: 5, effectiveCount: 4, limit: "viewport" });
    expect(resolveFrozenRows(input({ ...options, minSuffixHeight: 100 })))
      .toEqual({ requestedCount: 5, effectiveCount: 3, limit: "viewport" });
    expect(resolveFrozenRows(input({ ...options, minSuffixHeight: 200 })))
      .toEqual({ requestedCount: 5, effectiveCount: 0, limit: "viewport" });
  });

  it("tests the all-rows candidate without a suffix minimum", () => {
    const axis = createFixedAxis(3, 32);
    expect(resolveFrozenRows(input({ axis, requestedCount: 3, viewportHeight: 96 })))
      .toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });
    expect(resolveFrozenRows(input({ axis, requestedCount: 3, viewportHeight: 95 })))
      .toEqual({ requestedCount: 3, effectiveCount: 0, limit: "viewport" });
    expect(resolveFrozenRows(input({ axis, requestedCount: 2, viewportHeight: 96 })))
      .toEqual({ requestedCount: 2, effectiveCount: 1, limit: "viewport" });
  });

  it("uses the estimate while unmeasured and honors a measured zero", () => {
    const unmeasured = resolveFrozenRows(input({ viewportHeight: 0, viewportMeasured: false }));
    expect(UNMEASURED_VIEWPORT_HEIGHT).toBe(new ViewportState().getViewportHeight());
    expect(unmeasured).toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });
    expect(resolveFrozenRows(input({ viewportHeight: 0 })))
      .toEqual({ requestedCount: 3, effectiveCount: 0, limit: "viewport" });
    const estimated = resolveFrozenRows(input({
      requestedCount: 20,
      viewportHeight: 384,
      viewportMeasured: false,
    }));
    expect(estimated).toEqual({ requestedCount: 20, effectiveCount: 16, limit: "viewport" });
  });

  it("resolves valid zero geometry below the suffix minimum", () => {
    for (const viewportHeight of [32, 63]) {
      const resolved = resolveFrozenRows(input({ requestedCount: 1, viewportHeight }));
      expect(resolved).toEqual({ requestedCount: 1, effectiveCount: 0, limit: "viewport" });
      const layout = resolveRowRegionLayout(input({ requestedCount: 1, viewportHeight }));
      expect(layout).toMatchObject({ frozenCount: 0, frozenExtent: 0, suffixViewportHeight: viewportHeight });
    }
    expect(resolveFrozenRows(input({ requestedCount: 1, viewportHeight: 32, minSuffixHeight: 0 })).effectiveCount)
      .toBe(1);
    expect(resolveFrozenRows(input({ requestedCount: 3, viewportHeight: 160 })).effectiveCount).toBe(3);
  });

  it("leaves count zero and empty data without a limit", () => {
    expect(resolveFrozenRows(input({ requestedCount: 0, admitsPrefix: rejectsAll })))
      .toEqual({ requestedCount: 0, effectiveCount: 0, limit: null });
    const empty = resolveFrozenRows(input({
      axis: createFixedAxis(0, 32),
      requestedCount: 5,
      admitsPrefix: rejectsAll,
    }));
    expect(empty).toEqual({ requestedCount: 5, effectiveCount: 0, limit: null });
  });

  it("restores the count after viewport growth and budget changes", () => {
    const small = input({ requestedCount: 3, viewportHeight: 32 });
    expect(resolveFrozenRows(small).effectiveCount).toBe(0);
    expect(resolveFrozenRows(input({ requestedCount: 3, viewportHeight: 600 })).effectiveCount).toBe(3);

    let budget = 1;
    const dynamic = input({ requestedCount: 3, admitsPrefix: (count) => count <= budget });
    expect(resolveFrozenRows(dynamic)).toMatchObject({ effectiveCount: 1, limit: "cache" });
    budget = 3;
    expect(resolveFrozenRows(dynamic)).toMatchObject({ effectiveCount: 3, limit: null });
  });

  it("takes extents from a prefix axis with unequal sizes", () => {
    const axis = createPrefixAxis([10, 20, 30]);
    const all = resolveRowRegionLayout(input({ axis, requestedCount: 3, viewportHeight: 60 }));
    expect(all).toMatchObject({ frozenCount: 3, frozenExtent: 60, suffixViewportHeight: 0 });
    const two = resolveRowRegionLayout(input({
      axis,
      requestedCount: 2,
      viewportHeight: 30,
      minSuffixHeight: 0,
    }));
    expect(two).toMatchObject({ frozenCount: 2, frozenExtent: 30, suffixViewportHeight: 0 });
    expect(resolveFrozenRows(input({ axis, requestedCount: 2, viewportHeight: 31 })))
      .toEqual({ requestedCount: 2, effectiveCount: 0, limit: "viewport" });
    expect(resolveFrozenRows(input({
      axis,
      requestedCount: 3,
      viewportHeight: 59,
      minSuffixHeight: 0,
    }))).toEqual({ requestedCount: 3, effectiveCount: 2, limit: "viewport" });
  });

  it("rechecks the viewport when a cache reduction creates a suffix", () => {
    const axis = createFixedAxis(2, 32);
    const admitsOne = admitsUpTo(1);
    const withoutBudget = resolveFrozenRows(input({ axis, requestedCount: 2, viewportHeight: 96 }));
    expect(withoutBudget).toEqual({ requestedCount: 2, effectiveCount: 2, limit: null });
    expect(resolveFrozenRows(input({ axis, requestedCount: 2, viewportHeight: 96, admitsPrefix: admitsOne })))
      .toEqual({ requestedCount: 2, effectiveCount: 1, limit: "cache" });
    expect(resolveFrozenRows(input({ axis, requestedCount: 2, viewportHeight: 64, admitsPrefix: admitsOne })))
      .toEqual({ requestedCount: 2, effectiveCount: 0, limit: "cache" });
  });

  it("keeps the layout object while nothing changed", () => {
    const first = resolveRowRegionLayout(input());
    expect(first).toMatchObject({ frozenCount: 3, frozenExtent: 96, suffixViewportHeight: 504 });
    expect(first.frozen).toEqual({ requestedCount: 3, effectiveCount: 3, limit: null });
    const kept: RowRegionLayout = resolveRowRegionLayout(input(), first);
    expect(kept).toBe(first);
    const sameAxis = input();
    expect(resolveRowRegionLayout(sameAxis)).not.toBe(first);
    const changed = resolveRowRegionLayout(input({ viewportHeight: 100 }), first);
    expect(changed).not.toBe(first);
    expect(changed).toMatchObject({ frozenCount: 1, frozenExtent: 32, suffixViewportHeight: 68 });
    expect(changed.frozen.limit).toBe("viewport");
  });

  it("rebuilds the layout when only the limit changed", () => {
    const axis = createFixedAxis(1000, 170);
    const first = resolveRowRegionLayout(input({ axis, requestedCount: 5, viewportHeight: 600 }));
    expect(first.frozen).toEqual({ requestedCount: 5, effectiveCount: 3, limit: "viewport" });
    const capped = resolveRowRegionLayout(
      input({ axis, requestedCount: 5, viewportHeight: 600, maxCount: 3 }),
      first,
    );
    expect(capped).not.toBe(first);
    expect(capped).toMatchObject({ frozenCount: 3, frozenExtent: 510, suffixViewportHeight: 90 });
    expect(capped.frozen.limit).toBe("maxCount");
  });
});
