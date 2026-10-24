// packages/core/tests/row-height-overrides.test.ts

import { describe, expect, it } from "vitest";
import { RowHeightOverrides } from "../src/managers/row-height-overrides";
import type {
  LocateRowIds,
  PlacedRowSizeSource,
} from "../src/managers/row-height-overrides";
import type { RowId } from "../src/types";
import type { AxisBounds } from "../src/types/geometry";

const DEFAULT = 32;

interface HarnessOptions {
  rows?: readonly RowId[];
  rowCount?: number;
  stable?: boolean;
}

const createHarness = (options: HarnessOptions = {}) => {
  let rows = options.rows ?? ["a", "b", "c", "d", "e"];
  let revision = 0;
  const overrides = new RowHeightOverrides({
    getRowHeight: () => DEFAULT,
    getRowCount: () => options.rowCount ?? rows.length,
    hasStableIdentity: () => options.stable ?? true,
    getDataRevision: () => revision,
  });

  const locateWithin =
    (range?: AxisBounds): LocateRowIds =>
    (ids) => {
      const found = new Map<RowId, number>();
      const start = Math.max(0, range?.start ?? 0);
      const end = Math.min(range?.end ?? rows.length, rows.length);
      for (let index = start; index < end; index += 1) {
        const rowId = rows[index];
        if (rowId !== undefined && ids.has(rowId)) found.set(rowId, index);
      }
      return found;
    };

  /** Window-first lookup, then a full resident scan. */
  const locate: LocateRowIds = (ids) => {
    const windowed = locateWithin({ start: 0, end: 2 })(ids);
    for (const [rowId, index] of locateWithin()(ids)) windowed.set(rowId, index);
    return windowed;
  };

  const scan = locateWithin();

  const source = (revision: number): PlacedRowSizeSource => ({
    revision,
    rowCount: options.rowCount ?? rows.length,
    defaultSize: DEFAULT,
    stableIdentity: options.stable ?? true,
    scan,
  });

  return {
    overrides,
    locate,
    scan,
    source,
    setRows: (next: readonly RowId[]) => {
      rows = next;
    },
    bumpRevision: () => {
      revision += 1;
    },
    placed: (atRevision: number): readonly number[] =>
      overrides.getPlaced(source(atRevision)).map((entry) => entry.index),
  };
};

describe("RowHeightOverrides — set (D1)", () => {
  it("rejects a non-positive or non-finite height with the documented error", () => {
    const { overrides, locate } = createHarness();
    const invalid = [0, -1, Number.NaN, Number.POSITIVE_INFINITY];
    for (const height of invalid) {
      expect(() => overrides.set([{ rowId: "a", height }], locate)).toThrowError(
        `Invalid row height for row "a": ${height}`,
      );
    }
  });

  it("applies nothing when one entry of the call is invalid", () => {
    const { overrides, locate, placed } = createHarness();
    expect(() =>
      overrides.set([{ rowId: "a", height: 96 }, { rowId: "b", height: -4 }], locate),
    ).toThrowError(RangeError);
    expect(overrides.getOverrides()).toEqual([]);
    expect(placed(0)).toEqual([]);
  });

  it("lets the last entry of a duplicated identity win", () => {
    const { overrides, locate, source } = createHarness();
    expect(
      overrides.set([{ rowId: "b", height: 96 }, { rowId: "b", height: 64 }], locate),
    ).toBe(true);
    expect(overrides.getOverrides()).toEqual([{ rowId: "b", height: 64 }]);
    expect(overrides.getPlaced(source(0))).toEqual([{ index: 1, size: 64 }]);
  });

  it("reports no change for a value-equal call", () => {
    const { overrides, locate } = createHarness();
    expect(overrides.set([{ rowId: "b", height: 64 }], locate)).toBe(true);
    expect(overrides.set([{ rowId: "b", height: 64 }], locate)).toBe(false);
  });

  it("stores a height equal to rowHeight without placing it", () => {
    const { overrides, locate, placed } = createHarness();
    expect(overrides.set([{ rowId: "b", height: DEFAULT }], locate)).toBe(false);
    expect(overrides.getOverrides()).toEqual([{ rowId: "b", height: DEFAULT }]);
    expect(placed(0)).toEqual([]);
    expect(overrides.hasPending()).toBe(false);
  });
});

describe("RowHeightOverrides — placement (D2)", () => {
  it("places a window hit and keeps the placed array stable", () => {
    const { overrides, locate, source } = createHarness();
    overrides.set([{ rowId: "a", height: 96 }], locate);
    const first = overrides.getPlaced(source(0));
    expect(first).toEqual([{ index: 0, size: 96 }]);
    expect(overrides.getPlaced(source(0))).toBe(first);
  });

  it("leaves an unknown identity pending until its row arrives", () => {
    const harness = createHarness({ rows: ["a", "c"] });
    harness.overrides.set([{ rowId: "zz", height: 96 }], harness.locate);
    expect(harness.overrides.hasPending()).toBe(true);
    expect(harness.overrides.getPlaced(harness.source(0))).toEqual([]);
    expect(harness.overrides.placePending(harness.scan)).toBe(false);

    harness.setRows(["a", "zz", "c"]);
    expect(harness.overrides.placePending(harness.scan)).toBe(true);
    expect(harness.overrides.hasPending()).toBe(false);
    expect(harness.overrides.getPlaced(harness.source(0))).toEqual([{ index: 1, size: 96 }]);
  });

  it("sorts the placed array by view index", () => {
    const { overrides, locate, source } = createHarness({ rows: ["c", "b", "a"] });
    overrides.set([{ rowId: "a", height: 96 }, { rowId: "c", height: 64 }], locate);
    expect(overrides.getPlaced(source(0))).toEqual([
      { index: 0, size: 64 },
      { index: 2, size: 96 },
    ]);
  });

  it("drops index-scoped placements at the next data revision", () => {
    const harness = createHarness({ stable: false });
    // Without stable identity only integer identities place, at their index.
    harness.overrides.set([{ rowId: 3, height: 96 }], harness.locate);
    expect(harness.placed(0)).toEqual([3]);

    harness.bumpRevision();
    expect(harness.overrides.getPlaced(harness.source(1))).toEqual([]);
    expect(harness.overrides.getOverrides()).toEqual([]);
  });

  it("keeps an index placement from before the first load until it arrives", () => {
    const harness = createHarness({ stable: false, rows: [] });
    harness.overrides.set([{ rowId: 3, height: 96 }], harness.locate);
    expect(harness.overrides.hasPending()).toBe(true);
    expect(harness.placed(0)).toEqual([]);

    harness.setRows(["a", "b", "c", "d", "e"]);
    harness.bumpRevision();
    expect(harness.overrides.getPlaced(harness.source(1))).toEqual([{ index: 3, size: 96 }]);
  });

  it("keeps identity placements across a data revision", () => {
    const { overrides, locate, source } = createHarness();
    overrides.set([{ rowId: "b", height: 96 }], locate);
    expect(overrides.getPlaced(source(0))).toEqual([{ index: 1, size: 96 }]);
    expect(overrides.getPlaced(source(1))).toEqual([{ index: 1, size: 96 }]);
    expect(overrides.getOverrides()).toEqual([{ rowId: "b", height: 96 }]);
  });

  it("keeps a string identity pending without stable identity", () => {
    const { overrides, locate, source } = createHarness({ stable: false });
    overrides.set([{ rowId: "b", height: 96 }], locate);
    expect(overrides.hasPending()).toBe(true);
    expect(overrides.getPlaced(source(0))).toEqual([]);
  });

  it("drops a placement at or beyond the row count", () => {
    const { overrides, locate, placed } = createHarness({ stable: false, rowCount: 2 });
    overrides.set([{ rowId: 5, height: 96 }], locate);
    expect(placed(0)).toEqual([]);
    expect(overrides.hasPending()).toBe(true);
  });
});

describe("RowHeightOverrides — stale placements", () => {
  it("unplaces rows past a lowered row count and places them again on arrival", () => {
    const { overrides, locate, scan, placed, setRows } = createHarness();
    overrides.set([{ rowId: "e", height: 96 }], locate);
    expect(placed(0)).toEqual([4]);

    // A page arrival can lower the count without a new data revision.
    setRows(["a", "b", "c"]);
    expect(placed(0)).toEqual([]);
    expect(overrides.hasPending()).toBe(true);

    setRows(["a", "b", "c", "d", "e"]);
    expect(overrides.placePending(scan)).toBe(true);
    expect(placed(0)).toEqual([4]);
  });

  it("re-places a value-equal set issued after a data revision", () => {
    const { overrides, locate, placed, setRows, bumpRevision } = createHarness();
    overrides.set([{ rowId: "a", height: 96 }], locate);
    expect(placed(0)).toEqual([0]);

    setRows(["b", "c", "a", "d", "e"]);
    bumpRevision();
    expect(overrides.set([{ rowId: "a", height: 96 }], locate)).toBe(true);
    expect(placed(1)).toEqual([2]);
  });

  it("looks up only the changed and pending identities", () => {
    const { overrides, locate } = createHarness();
    const requested: RowId[][] = [];
    const counting: LocateRowIds = (ids) => {
      requested.push([...ids]);
      return locate(ids);
    };
    overrides.set([{ rowId: "a", height: 96 }, { rowId: "missing", height: 64 }], counting);
    overrides.set([{ rowId: "c", height: 48 }], counting);
    expect(requested).toEqual([["a", "missing"], ["c", "missing"]]);
  });
});

describe("RowHeightOverrides — reset and clear (D1)", () => {
  it("drops one identity, all identities and everything", () => {
    const { overrides, locate, source } = createHarness();
    overrides.set([{ rowId: "a", height: 96 }, { rowId: "c", height: 64 }], locate);
    expect(overrides.reset(["a"])).toBe(true);
    expect(overrides.getPlaced(source(0))).toEqual([{ index: 2, size: 64 }]);
    expect(overrides.reset(["missing"])).toBe(false);

    expect(overrides.reset()).toBe(true);
    expect(overrides.getOverrides()).toEqual([]);
    expect(overrides.getPlaced(source(0))).toEqual([]);
    expect(overrides.reset()).toBe(false);

    overrides.set([{ rowId: "b", height: 96 }], locate);
    overrides.clear();
    expect(overrides.size).toBe(0);
    expect(overrides.getPlaced(source(0))).toEqual([]);
  });
});
