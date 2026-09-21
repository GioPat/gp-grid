// packages/core/tests/column-window.test.ts

import { describe, expect, it } from "vitest";
import {
  buildCenterOffsets,
  createColumnWindowResolver,
  MAX_RETAINED_COLUMNS,
  MAX_RETENTION_KEYS,
  mergeRetained,
  resolveCenterRange,
  UNMEASURED_CENTER_EXTENT,
  type ColumnWindowResolver,
} from "../src/geometry/column-window";
import type { ColumnLayoutSnapshot, DisplayedColumn, ResolvedColumn } from "../src/types/geometry";

/** Small deterministic LCG so seed failures are reproducible. */
const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const widthsOf = (count: number, seed: number): number[] => {
  const random = seeded(seed);
  return Array.from({ length: count }, () => 40 + Math.floor(random() * 260));
};

const columnsOf = (widths: readonly number[]): DisplayedColumn[] => {
  let offset = 0;
  return widths.map((width, layoutIndex) => {
    const displayed: DisplayedColumn = {
      columnId: `c${layoutIndex}`,
      layoutIndex,
      column: { field: `c${layoutIndex}`, cellDataType: "text", width },
      offset,
      width,
    };
    offset += width;
    return displayed;
  });
};

/** Independent linear oracle: every column intersecting the widened window. */
const oracleRange = (
  widths: readonly number[],
  scrollLeft: number,
  viewportWidth: number,
  overscan: number,
): { start: number; end: number } => {
  const total = widths.reduce((a, b) => a + b, 0);
  const maxScroll = Math.max(0, total - viewportWidth);
  const scroll = Math.max(0, Math.min(scrollLeft, maxScroll));
  const from = scroll - overscan;
  const to = scroll + viewportWidth + overscan;

  const edges = [0];
  for (const width of widths) edges.push(edges.at(-1)! + width);

  let start = 0;
  for (let index = 1; index < widths.length; index += 1) {
    if (edges[index]! <= from) start = index;
  }
  let end = 0;
  for (let index = 0; index < widths.length; index += 1) {
    if (edges[index]! < to) end = index + 1;
  }
  return { start, end: Math.max(end, start) };
};

describe("resolveCenterRange", () => {
  it("matches an independent oracle over seeded widths", () => {
    for (const seed of [1, 7, 42, 1234, 999_983]) {
      const widths = widthsOf(60, seed);
      const offsets = buildCenterOffsets(columnsOf(widths), 0, widths.length);
      const total = widths.reduce((a, b) => a + b, 0);

      for (const scrollLeft of [0, 137, 900, 4_000, 999_999]) {
        for (const viewport of [1, 320, 1_500]) {
          for (const overscan of [0, 240]) {
            const range = resolveCenterRange({
              offsets,
              centerTotal: total,
              scrollLeft,
              centerViewportWidth: viewport,
              overscan,
            });
            expect(range).toEqual(oracleRange(widths, scrollLeft, viewport, overscan));
          }
        }
      }
    }
  });

  it("includes a column only partially inside the overscanned window", () => {
    const widths = [100, 100, 100, 100];
    const offsets = buildCenterOffsets(columnsOf(widths), 0, 4);
    const range = resolveCenterRange({
      offsets,
      centerTotal: 400,
      scrollLeft: 150,
      centerViewportWidth: 100,
      overscan: 10,
    });
    // The window is [140, 260): column 0 ends exactly at 140 and is excluded,
    // columns 1 and 2 both intersect it.
    expect(range).toEqual({ start: 1, end: 3 });
  });

  it("mounts nothing when the center clip is zero", () => {
    const offsets = buildCenterOffsets(columnsOf([100, 100]), 0, 2);
    expect(resolveCenterRange({
      offsets,
      centerTotal: 200,
      scrollLeft: 0,
      centerViewportWidth: 0,
      overscan: 240,
    })).toEqual({ start: 0, end: 0 });
  });

  it("falls back to a bounded extent before measurement", () => {
    const widths = widthsOf(200, 5);
    const offsets = buildCenterOffsets(columnsOf(widths), 0, widths.length);
    const total = widths.reduce((a, b) => a + b, 0);
    const range = resolveCenterRange({
      offsets,
      centerTotal: total,
      scrollLeft: 7_000,
      centerViewportWidth: -1,
      overscan: 240,
    });
    // Unmeasured: the sample is ignored and the first 1920 px plus overscan mount.
    const measured = resolveCenterRange({
      offsets,
      centerTotal: total,
      scrollLeft: 0,
      centerViewportWidth: UNMEASURED_CENTER_EXTENT,
      overscan: 240,
    });
    expect(range).toEqual(measured);
    expect(range.end).toBeGreaterThan(0);
  });

  it("keeps an empty center range empty", () => {
    expect(resolveCenterRange({
      offsets: [0],
      centerTotal: 0,
      scrollLeft: 0,
      centerViewportWidth: 300,
      overscan: 240,
    })).toEqual({ start: 0, end: 0 });
  });
});

describe("column-window retention", () => {
  const layout = (): ColumnLayoutSnapshot => {
    const columns: ResolvedColumn[] = columnsOf(widthsOf(100, 5)).map((column) => ({
      ...column,
      region: "center",
      regionOffset: column.offset,
    }));
    return {
      revision: 1,
      mode: "fixed",
      columns,
      totalWidth: columns.reduce((total, column) => total + column.width, 0),
      regions: {
        centerStart: 0,
        centerEnd: columns.length,
        startWidth: 0,
        endWidth: 0,
        endOffset: 0,
        centerViewportWidth: 400,
      },
    };
  };
  const resolver = (): ColumnWindowResolver =>
    createColumnWindowResolver({
      getLayout: layout,
      getScrollLeft: () => 0,
      getViewportWidth: () => 400,
      getOverscan: () => 0,
    });
  const ids = (retained: ColumnWindowResolver): string[] =>
    retained.get().center.map((column) => column.columnId);

  it("reads the edit key first even when it was registered last", () => {
    const window = resolver();
    for (let index = 0; index < 5; index += 1) window.retain(`m${index}`, ["c0"]);
    window.retain("edit", ["c90"]);
    expect(ids(window)).toContain("c90");
  });

  it("keeps the edit key when the registration budget is exhausted", () => {
    const window = resolver();
    window.retain("edit", ["c90"]);
    for (let index = 0; index < MAX_RETENTION_KEYS; index += 1) {
      window.retain(`m${index}`, [`c${10 + index}`]);
    }
    expect(ids(window)).toContain("c90");
  });

  it("bounds what a single key may register", () => {
    const window = resolver();
    window.retain("edit", []);
    window.retain("bulk", columnsOf(widthsOf(20, 9)).map((column) => column.columnId));
    // The union cap keeps the first 16 ids of the single stored key.
    expect(ids(window)).toHaveLength(MAX_RETAINED_COLUMNS);
  });
});

describe("mergeRetained", () => {
  const columns = columnsOf([100, 100, 100, 100, 100]);
  // Retention addresses displayed indices directly, as the resolver's index does.
  const locate = (columnId: string): number | undefined => {
    const index = columns.findIndex((column) => column.columnId === columnId);
    return index === -1 ? undefined : index;
  };

  it("returns the range in displayed order without retention", () => {
    const center = mergeRetained(columns, { start: 1, end: 3 }, 5, [], locate);
    expect(center.map((column) => column.columnId)).toEqual(["c1", "c2"]);
  });

  it("merges retained columns in displayed order", () => {
    const center = mergeRetained(columns, { start: 1, end: 3 }, 5, ["c4", "c0"], locate);
    expect(center.map((column) => column.columnId)).toEqual(["c0", "c1", "c2", "c4"]);
  });

  it("ignores retained ids at or past the center end", () => {
    // `centerEnd = 2`, so c2 is a pin and never merged.
    const center = mergeRetained(columns, { start: 1, end: 2 }, 2, ["c0", "c2"], locate);
    expect(center.map((column) => column.columnId)).toEqual(["c0", "c1"]);
  });

  it("does not duplicate a retained column already in the range", () => {
    const center = mergeRetained(columns, { start: 1, end: 3 }, 5, ["c1"], locate);
    expect(center.map((column) => column.columnId)).toEqual(["c1", "c2"]);
  });

  it("looks a retained id up once instead of scanning every center column", () => {
    const wide = columnsOf(widthsOf(2_000, 3));
    let lookups = 0;
    const center = mergeRetained(wide, { start: 0, end: 10 }, 2_000, ["c1999"], (columnId) => {
      lookups += 1;
      const index = wide.findIndex((column) => column.columnId === columnId);
      return index === -1 ? undefined : index;
    });
    expect(lookups).toBe(1);
    expect(center.map((column) => column.columnId)).toEqual([
      "c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c1999",
    ]);
  });
});

describe("window resolution cost", () => {
  it("resolves 10,000 columns without rebuilding prefixes per scroll", () => {
    const widths = widthsOf(10_000, 11);
    const columns = columnsOf(widths);
    const offsets = buildCenterOffsets(columns, 0, columns.length);
    const total = widths.reduce((a, b) => a + b, 0);

    let constructions = 0;
    for (let step = 0; step < 1_000; step += 1) {
      const range = resolveCenterRange({
        offsets,
        centerTotal: total,
        scrollLeft: step * 25,
        centerViewportWidth: 800,
        overscan: 240,
      });
      if (range.end > range.start) constructions += 1;
    }
    // One prefix build outside the loop; the loop itself only binary-searches.
    expect(constructions).toBe(1_000);
    expect(offsets).toHaveLength(10_001);
  });
});
