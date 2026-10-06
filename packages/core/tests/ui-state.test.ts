import { describe, expect, it } from "vitest";
import { applyInstruction } from "../src/state-reducer";
import { createInitialState } from "../src/types/ui-state";
import { EMPTY_HEADER_FRAGMENTS } from "../src/column-groups";
import type { ColumnDefinition, ColumnGroupChild } from "../src/types";
import type { ColumnLayoutSnapshot } from "../src/types/geometry";

const column = (field: string, width: number, extra: Partial<ColumnDefinition> = {}): ColumnDefinition =>
  ({ field, cellDataType: "text", width, ...extra }) as ColumnDefinition;

const twoColumns = (): ColumnDefinition[] => [column("a", 100), column("b", 100)];

describe("createInitialState — defaults", () => {
  it("starts empty, in fit mode, with no layout and no pending scroll", () => {
    const state = createInitialState();
    expect(state.columns).toEqual([]);
    expect(state.layout).toBeNull();
    expect(state.columnLayout).toBe("fit");
    expect(state.geometryRevision).toBe(0);
    expect(state.contentWidth).toBe(0);
    expect(state.peekCell).toBeNull();
    expect(state.pendingScrollTop).toBeNull();
    expect(state.pendingScrollLeft).toBeNull();
    expect(state.headerBands).toEqual({ count: 1, heights: [0], offsets: [0], totalHeight: 0 });
  });

  it("seeds the zero-count region layout and no announcement", () => {
    const state = createInitialState();
    expect(state.rowRegions).toEqual({
      frozenCount: 0,
      frozenExtent: 0,
      suffixViewportHeight: 0,
      frozen: { requestedCount: 0, effectiveCount: 0, limit: null },
    });
    expect(state.announcement).toBeNull();
    expect(state.hierarchical).toBe(false);
  });

  it("hands out independent maps per state", () => {
    const first = createInitialState();
    const second = createInitialState();
    first.slots.set("slot-0", {
      slotId: "slot-0",
      rowIndex: 0,
      rowData: undefined,
      generation: 1,
      translateY: 0,
      height: 0,
      region: "suffix",
      loading: false,
    });
    expect(second.slots.size).toBe(0);
    expect(first.headers).not.toBe(second.headers);
  });

  it("keeps an empty column list without a layout", () => {
    const state = createInitialState({ initialColumns: [], initialWidth: 800 });
    expect(state.layout).toBeNull();
    expect(state.contentWidth).toBe(0);
    expect(state.viewportWidth).toBe(800);
  });
});

describe("createInitialState — seeded first render", () => {
  it("takes the published regions and announcement over the seed", () => {
    const seeded = createInitialState();
    const rowRegions = {
      frozenCount: 2,
      frozenExtent: 64,
      suffixViewportHeight: 256,
      frozen: { requestedCount: 2, effectiveCount: 2, limit: null },
    };
    const announcement = { message: "2 of 2 rows frozen", revision: 7 };
    const state = {
      ...seeded,
      ...applyInstruction(
        { type: "SET_ROW_REGIONS", regions: rowRegions, revision: 7 },
        seeded.slots,
        seeded.headers,
      ),
      ...applyInstruction(
        { type: "SET_ANNOUNCEMENT", announcement, revision: 7 },
        seeded.slots,
        seeded.headers,
      ),
    };
    expect(state.rowRegions).toBe(rowRegions);
    expect(state.announcement).toBe(announcement);
  });

  it("fits the seeded columns to the initial width", () => {
    const columns = twoColumns();
    const state = createInitialState({ initialColumns: columns, initialWidth: 400, initialHeight: 300 });
    expect(state.columns).toBe(columns);
    expect(state.layout?.mode).toBe("fit");
    expect(state.layout?.revision).toBe(0);
    expect(state.layout?.columns.map((c) => [c.columnId, c.offset, c.width])).toEqual([
      ["a", 0, 200],
      ["b", 200, 200],
    ]);
    expect(state.contentWidth).toBe(400);
    expect(state.contentWidth).toBe(state.layout?.totalWidth);
    expect(state.viewportHeight).toBe(300);
  });

  it("keeps declared widths in fixed mode and mirrors the mode", () => {
    const state = createInitialState({
      initialColumns: twoColumns(),
      initialWidth: 400,
      initialColumnLayout: "fixed",
    });
    expect(state.columnLayout).toBe("fixed");
    expect(state.layout?.mode).toBe("fixed");
    expect(state.layout?.columns.map((c) => c.width)).toEqual([100, 100]);
    expect(state.contentWidth).toBe(200);
  });

  it("uses declared widths when no initial width is known", () => {
    const state = createInitialState({ initialColumns: twoColumns() });
    expect(state.layout?.columns.map((c) => c.width)).toEqual([100, 100]);
    expect(state.contentWidth).toBe(200);
    expect(state.viewportWidth).toBe(0);
  });

  it("leaves hidden columns out of the seeded layout but keeps their index", () => {
    const columns = [column("a", 100), column("b", 100, { hidden: true }), column("c", 100)];
    const state = createInitialState({ initialColumns: columns, initialWidth: 0 });
    expect(state.columns).toHaveLength(3);
    expect(state.layout?.columns.map((c) => [c.columnId, c.layoutIndex])).toEqual([
      ["a", 0],
      ["c", 2],
    ]);
  });

  it("prefers a core-resolved layout over resolving the columns again", () => {
    const columns = twoColumns();
    const initialLayout: ColumnLayoutSnapshot = {
      revision: 12,
      mode: "fixed",
      totalWidth: 640,
      columns: [{ columnId: "a", layoutIndex: 0, column: columns[0]!, offset: 0, width: 640 }],
    };
    const state = createInitialState({ initialColumns: columns, initialWidth: 400, initialLayout });
    expect(state.layout).toBe(initialLayout);
    expect(state.contentWidth).toBe(640);
  });
});

describe("seeded state is replaced by the first core batch", () => {
  it("takes the published layout, revision and content size over the seed", () => {
    const columns = twoColumns();
    const seeded = createInitialState({ initialColumns: columns, initialWidth: 400 });
    const published: ColumnLayoutSnapshot = {
      revision: 3,
      mode: "fit",
      totalWidth: 900,
      columns: [
        { columnId: "a", layoutIndex: 0, column: columns[0]!, offset: 0, width: 450 },
        { columnId: "b", layoutIndex: 1, column: columns[1]!, offset: 450, width: 450 },
      ],
    };
    const state = {
      ...seeded,
      ...applyInstruction(
        { type: "COLUMNS_CHANGED", columns, layout: published, revision: 3 },
        seeded.slots,
        seeded.headers,
      ),
      ...applyInstruction(
        {
          type: "SET_CONTENT_SIZE",
          width: 900,
          height: 3200,
          viewportWidth: 900,
          viewportHeight: 320,
          rowsWrapperOffset: 0,
          revision: 3,
        },
        seeded.slots,
        seeded.headers,
      ),
    };
    expect(state.layout).toBe(published);
    expect(state.geometryRevision).toBe(3);
    expect(state.contentWidth).toBe(900);
    expect(state.viewportWidth).toBe(900);
  });
});

describe("createInitialState — header bands (D8)", () => {
  /** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
  const prdFixture = (): ColumnGroupChild[] => [
    { groupId: "Region", children: [
      { groupId: "North", children: [{ groupId: "Q1", children: ["a", "b"] }, "c"] },
      "d",
    ] },
    { groupId: "Totals", children: ["e", "f"] },
    "x",
  ];
  const reversed = (): ColumnDefinition[] =>
    ["x", "f", "e", "d", "c", "b", "a"].map((field) => column(field, 100));

  it("seeds one band of the header height while flat and ignores heights past it", () => {
    const state = createInitialState({
      initialColumns: twoColumns(),
      initialHeaderHeight: 36,
      initialHeaderBandHeights: [40, 99],
    });
    expect(state.headerBands).toEqual({ count: 1, heights: [40], offsets: [0], totalHeight: 40 });
    expect(createInitialState({ initialHeaderHeight: 36 }).headerBands.heights).toEqual([36]);
  });

  it("adopts the hierarchy as the core does: depth-first leaves, bands and fragments", () => {
    const state = createInitialState({
      initialColumns: reversed(),
      initialColumnGroups: prdFixture(),
      initialColumnLayout: "fixed",
      initialWidth: 2_000,
      initialHeaderHeight: 36,
      initialHeaderBandHeights: [24],
    });
    expect(state.columns.map((definition) => definition.field))
      .toEqual(["a", "b", "c", "d", "e", "f", "x"]);
    expect(state.layout?.bandCount).toBe(4);
    expect(state.layout?.columns.map((displayed) => displayed.headerBand))
      .toEqual([3, 3, 2, 1, 1, 1, 0]);
    expect(state.headerBands).toEqual({
      count: 4,
      heights: [24, 36, 36, 36],
      offsets: [0, 24, 60, 96],
      totalHeight: 132,
    });
    expect(state.columnWindow?.groups.center.map((fragment) => fragment.fragmentId)).toEqual([
      "Region:center:0",
      "Totals:center:0",
      "North:center:0",
      "Q1:center:0",
    ]);
  });

  it("seeds a rejected hierarchy flat", () => {
    const columns = reversed();
    const state = createInitialState({
      initialColumns: columns,
      initialColumnGroups: [{ groupId: "G", children: ["a", "b"] }],
      initialHeaderHeight: 36,
    });
    expect(state.columns).toBe(columns);
    expect(state.layout?.bandCount).toBe(1);
    expect(state.headerBands.count).toBe(1);
    expect(state.columnWindow?.groups).toBe(EMPTY_HEADER_FRAGMENTS);
  });

  it("rejects an invalid band height with the option's message", () => {
    expect(() => createInitialState({ initialHeaderBandHeights: [36, 0] }))
      .toThrow(new RangeError("Invalid headerBandHeights[1]: 0"));
  });
});
