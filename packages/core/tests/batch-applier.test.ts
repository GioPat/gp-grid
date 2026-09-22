import { describe, expect, it, vi } from "vitest";
import { applyBatchInstructions, type BatchChangeSetters } from "../src/adapter/batch-applier";
import type { ColumnDefinition, GridInstruction } from "../src/types";
import type { ColumnLayoutSnapshot } from "../src/types/geometry";
import type { HeaderData, SlotData } from "../src/types/ui-state";

const REQUIRED_SETTERS = [
  "setContentWidth",
  "setContentHeight",
  "setRowsWrapperOffset",
  "setIsLoading",
  "setErrorMessage",
  "setTotalRows",
  "setPendingScrollTop",
  "setPendingScrollLeft",
  "setActiveCell",
  "setSelectionRange",
  "setEditingCell",
  "setHoverPosition",
  "setPeekCell",
  "setColumns",
  "onFilterPopupChange",
] as const;

const OPTIONAL_SETTERS = [
  "setLayout",
  "setColumnWindow",
  "setColumnLayout",
  "setGeometryRevision",
] as const;

type SetterName = (typeof REQUIRED_SETTERS)[number] | (typeof OPTIONAL_SETTERS)[number];
type MockedSetters = BatchChangeSetters & Record<SetterName, ReturnType<typeof vi.fn>>;

const makeSetters = (withOptional = true): MockedSetters => {
  const names: readonly SetterName[] = withOptional
    ? [...REQUIRED_SETTERS, ...OPTIONAL_SETTERS]
    : REQUIRED_SETTERS;
  return Object.fromEntries(names.map((name) => [name, vi.fn()])) as unknown as MockedSetters;
};

/** Names of the setters a batch reached, in call order. */
const calledSetters = (setters: MockedSetters): string[] =>
  Object.entries(setters)
    .filter(([, setter]) => setter.mock.calls.length > 0)
    .map(([name]) => name)
    .sort();

const apply = (
  instructions: GridInstruction[],
  setters: MockedSetters = makeSetters(),
  slots = new Map<string, SlotData>(),
  headers = new Map<string, HeaderData>(),
) => ({ setters, maps: applyBatchInstructions(instructions, slots, headers, setters) });

const column: ColumnDefinition = { field: "name", cellDataType: "text", width: 120 };

const regions = {
  centerStart: 0,
  centerEnd: 1,
  startWidth: 0,
  endWidth: 0,
  endOffset: 120,
  centerViewportWidth: 400,
};

const layout: ColumnLayoutSnapshot = {
  revision: 4,
  mode: "fit",
  totalWidth: 120,
  regions,
  columns: [
    { columnId: "name", layoutIndex: 0, column, offset: 0, width: 120, region: "center", regionOffset: 0 },
  ],
};

describe("applyBatchInstructions — slot and header maps", () => {
  it("applies slot instructions to a copy and leaves the inputs untouched", () => {
    const slots = new Map<string, SlotData>();
    const { maps, setters } = apply(
      [
        { type: "CREATE_SLOT", slotId: "slot-0", generation: 1 },
        { type: "ASSIGN_SLOT", slotId: "slot-0", rowIndex: 7, rowData: { id: 7 }, generation: 2 },
        { type: "MOVE_SLOT", slotId: "slot-0", translateY: 224 },
      ],
      makeSetters(),
      slots,
    );
    expect(maps.slots.get("slot-0")).toEqual({
      slotId: "slot-0",
      rowIndex: 7,
      rowData: { id: 7 },
      generation: 2,
      translateY: 224,
    });
    expect(slots.size).toBe(0);
    expect(maps.slots).not.toBe(slots);
    expect(calledSetters(setters)).toEqual([]);
  });

  it("recycles from the current slots and destroys the ones released", () => {
    const current = new Map<string, SlotData>([
      ["slot-0", { slotId: "slot-0", rowIndex: 0, rowData: { id: 0 }, generation: 1, translateY: 0 }],
      ["slot-1", { slotId: "slot-1", rowIndex: 1, rowData: { id: 1 }, generation: 1, translateY: 32 }],
    ]);
    const { maps } = apply(
      [
        { type: "DESTROY_SLOT", slotId: "slot-1" },
        { type: "MOVE_SLOT", slotId: "slot-0", translateY: 64 },
        { type: "MOVE_SLOT", slotId: "missing", translateY: 1 },
        { type: "ASSIGN_SLOT", slotId: "missing", rowIndex: 3, rowData: {}, generation: 9 },
      ],
      makeSetters(),
      current,
    );
    expect([...maps.slots.keys()]).toEqual(["slot-0"]);
    expect(maps.slots.get("slot-0")?.translateY).toBe(64);
    expect(current.size).toBe(2);
    expect(current.get("slot-0")?.translateY).toBe(0);
  });

  it("updates and removes headers on a copy", () => {
    const headers = new Map<string, HeaderData>([
      ["stale", { column, sortDirection: undefined, sortIndex: undefined, hasFilter: false }],
    ]);
    const { maps } = apply(
      [
        {
          type: "UPDATE_HEADER",
          columnId: "name",
          column,
          sortDirection: "asc",
          sortIndex: 1,
          hasFilter: true,
        },
        { type: "REMOVE_HEADERS", columnIds: ["stale"] },
      ],
      makeSetters(),
      new Map(),
      headers,
    );
    expect([...maps.headers.keys()]).toEqual(["name"]);
    expect(maps.headers.get("name")).toEqual({
      column,
      sortDirection: "asc",
      sortIndex: 1,
      hasFilter: true,
    });
    expect(headers.has("stale")).toBe(true);
  });

  it("ignores an instruction the reducer does not know", () => {
    const { maps, setters } = apply([{ type: "NOT_AN_INSTRUCTION" } as unknown as GridInstruction]);
    expect(maps.slots.size).toBe(0);
    expect(calledSetters(setters)).toEqual([]);
  });

  it("keeps both maps by identity for a window-only batch", () => {
    const slots = new Map<string, SlotData>();
    const headers = new Map<string, HeaderData>();
    const window = { layout, range: { start: 0, end: 0 }, start: [], center: [], end: [] };

    const { maps } = apply(
      [{ type: "SET_COLUMN_WINDOW", window, revision: 6 }],
      makeSetters(),
      slots,
      headers,
    );

    expect(maps.slots).toBe(slots);
    expect(maps.headers).toBe(headers);
  });

  it("copies only the map an instruction mutates", () => {
    const slots = new Map<string, SlotData>();
    const headers = new Map<string, HeaderData>();

    const { maps } = apply(
      [{ type: "CREATE_SLOT", slotId: "slot-0", generation: 1 }],
      makeSetters(),
      slots,
      headers,
    );

    expect(maps.slots).not.toBe(slots);
    expect(maps.headers).toBe(headers);
  });
});

describe("applyBatchInstructions — scalar setters", () => {
  it("publishes content size, wrapper offset and the geometry revision", () => {
    const { setters } = apply([
      {
        type: "SET_CONTENT_SIZE",
        width: 600,
        height: 3200,
        viewportWidth: 300,
        viewportHeight: 320,
        rowsWrapperOffset: 48,
        revision: 9,
      },
    ]);
    expect(setters.setContentWidth).toHaveBeenCalledWith(600);
    expect(setters.setContentHeight).toHaveBeenCalledWith(3200);
    expect(setters.setRowsWrapperOffset).toHaveBeenCalledWith(48);
    expect(setters.setGeometryRevision).toHaveBeenCalledWith(9);
    expect(calledSetters(setters)).toEqual([
      "setContentHeight",
      "setContentWidth",
      "setGeometryRevision",
      "setRowsWrapperOffset",
    ]);
  });

  it("publishes the wrapper offset of a visible-range update", () => {
    const { setters } = apply([
      { type: "UPDATE_VISIBLE_RANGE", start: 10, end: 30, rowsWrapperOffset: 128 },
    ]);
    expect(setters.setRowsWrapperOffset).toHaveBeenCalledWith(128);
    expect(calledSetters(setters)).toEqual(["setRowsWrapperOffset"]);
  });

  it("sets only the scroll axis a correction carries", () => {
    const horizontal = apply([{ type: "SCROLL_TO", scrollLeft: 90 }]).setters;
    expect(horizontal.setPendingScrollLeft).toHaveBeenCalledWith(90);
    expect(calledSetters(horizontal)).toEqual(["setPendingScrollLeft"]);

    const vertical = apply([{ type: "SCROLL_TO", scrollTop: 640 }]).setters;
    expect(vertical.setPendingScrollTop).toHaveBeenCalledWith(640);
    expect(calledSetters(vertical)).toEqual(["setPendingScrollTop"]);

    const both = apply([{ type: "SCROLL_TO", scrollTop: 0, scrollLeft: 0 }]).setters;
    expect(both.setPendingScrollTop).toHaveBeenCalledWith(0);
    expect(both.setPendingScrollLeft).toHaveBeenCalledWith(0);
  });

  it("publishes the loading lifecycle", () => {
    const loading = apply([{ type: "DATA_LOADING" }]).setters;
    expect(loading.setIsLoading).toHaveBeenCalledWith(true);
    expect(loading.setErrorMessage).toHaveBeenCalledWith(null);

    const loaded = apply([{ type: "DATA_LOADED", totalRows: 1_000 }]).setters;
    expect(loaded.setIsLoading).toHaveBeenCalledWith(false);
    expect(loaded.setTotalRows).toHaveBeenCalledWith(1_000);
    expect(loaded.setErrorMessage).not.toHaveBeenCalled();

    const failed = apply([{ type: "DATA_ERROR", error: "boom" }]).setters;
    expect(failed.setIsLoading).toHaveBeenCalledWith(false);
    expect(failed.setErrorMessage).toHaveBeenCalledWith("boom");
  });

  it("publishes selection, hover and edit state, including clears", () => {
    const range = { startRow: 1, startCol: 0, endRow: 3, endCol: 2 };
    const { setters } = apply([
      { type: "SET_ACTIVE_CELL", position: { row: 1, col: 0 } },
      { type: "SET_SELECTION_RANGE", range },
      { type: "SET_HOVER_POSITION", position: { row: 2, col: 1 } },
      { type: "START_EDIT", row: 1, col: 0, initialValue: "a", editId: 5 },
    ]);
    expect(setters.setActiveCell).toHaveBeenCalledWith({ row: 1, col: 0 });
    expect(setters.setSelectionRange).toHaveBeenCalledWith(range);
    expect(setters.setHoverPosition).toHaveBeenCalledWith({ row: 2, col: 1 });
    expect(setters.setEditingCell).toHaveBeenCalledWith({
      row: 1,
      col: 0,
      initialValue: "a",
      editId: 5,
    });

    const cleared = apply([
      { type: "SET_ACTIVE_CELL", position: null },
      { type: "SET_SELECTION_RANGE", range: null },
      { type: "SET_HOVER_POSITION", position: null },
      { type: "STOP_EDIT" },
    ]).setters;
    expect(cleared.setActiveCell).toHaveBeenCalledWith(null);
    expect(cleared.setSelectionRange).toHaveBeenCalledWith(null);
    expect(cleared.setHoverPosition).toHaveBeenCalledWith(null);
    expect(cleared.setEditingCell).toHaveBeenCalledWith(null);
  });

  it("delivers every instruction of a batch, in order", () => {
    const { setters } = apply([
      { type: "SET_ACTIVE_CELL", position: { row: 0, col: 0 } },
      { type: "SET_ACTIVE_CELL", position: { row: 5, col: 1 } },
    ]);
    expect(setters.setActiveCell.mock.calls).toEqual([[{ row: 0, col: 0 }], [{ row: 5, col: 1 }]]);
  });
});

describe("applyBatchInstructions — columns, layout and filter popup", () => {
  it("publishes columns, layout and revision together", () => {
    const { setters } = apply([{ type: "COLUMNS_CHANGED", columns: [column], layout, revision: 4 }]);
    expect(setters.setColumns).toHaveBeenCalledWith([column]);
    expect(setters.setLayout).toHaveBeenCalledWith(layout);
    expect(setters.setGeometryRevision).toHaveBeenCalledWith(4);
  });

  it("publishes the mounted column window with its revision", () => {
    const window = {
      layout,
      range: { start: 0, end: 0 },
      start: [],
      center: [],
      end: [],
    };
    const { setters } = apply([{ type: "SET_COLUMN_WINDOW", window, revision: 6 }]);
    expect(setters.setColumnWindow).toHaveBeenCalledWith(window);
    expect(setters.setGeometryRevision).toHaveBeenCalledWith(6);
  });

  it("never hands a missing layout to the wrapper", () => {
    const malformed = {
      type: "COLUMNS_CHANGED",
      columns: [column],
      layout: null,
      revision: 4,
    } as unknown as GridInstruction;
    const { setters } = apply([malformed]);
    expect(setters.setColumns).toHaveBeenCalledWith([column]);
    expect(setters.setLayout).not.toHaveBeenCalled();
  });

  it("tolerates a wrapper without the optional layout setters", () => {
    const setters = makeSetters(false);
    const window = {
      layout,
      range: { start: 0, end: 0 },
      start: [],
      center: [],
      end: [],
    };
    const batch: GridInstruction[] = [
      { type: "COLUMNS_CHANGED", columns: [column], layout, revision: 4 },
      { type: "SET_COLUMN_WINDOW", window, revision: 4 },
      {
        type: "SET_CONTENT_SIZE",
        width: 120,
        height: 320,
        viewportWidth: 300,
        viewportHeight: 320,
        rowsWrapperOffset: 0,
        revision: 4,
      },
    ];
    expect(() => apply(batch, setters)).not.toThrow();
    expect(setters.setColumns).toHaveBeenCalledWith([column]);
    expect(setters.setContentWidth).toHaveBeenCalledWith(120);
  });

  it("opens and closes the filter popup", () => {
    const anchorRect = { top: 10, left: 20, width: 100, height: 32 };
    const opened = apply([
      {
        type: "OPEN_FILTER_POPUP",
        colIndex: 0,
        column,
        anchorRect,
        distinctValues: ["a", "b"],
        currentFilter: undefined,
      },
    ]).setters;
    expect(opened.onFilterPopupChange).toHaveBeenCalledWith({
      isOpen: true,
      colIndex: 0,
      column,
      anchorRect,
      distinctValues: ["a", "b"],
      currentFilter: undefined,
    });

    const closed = apply([{ type: "CLOSE_FILTER_POPUP" }]).setters;
    expect(closed.onFilterPopupChange).toHaveBeenCalledWith(null);
  });
});
