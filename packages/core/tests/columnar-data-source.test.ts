// packages/core/tests/columnar-data-source.test.ts

import { describe, it, expect, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createColumnarDataSource } from "../src/data-source";
import {
  isColumnarDataSource,
  type CellValueChangedEvent,
  type CellWriteRejectedEvent,
  type ColumnDefinition,
} from "../src/types";

const ids = [1, 2, 3, 4, 5];
const names = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
const scores = [50, 20, 40, 10, 30];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 60 },
  { field: "name", cellDataType: "text", width: 160, editable: true },
  { field: "score", cellDataType: "number", width: 80, editable: true },
];

const makeSource = () => {
  let reads = 0;
  const source = createColumnarDataSource({
    getRowId: (sourceRow) => ids[sourceRow]!,
    fields: [
      { field: "id", data: ids },
      { field: "name", data: names },
      {
        field: "score",
        getValue: (sourceRow) => {
          reads += 1;
          return scores[sourceRow]!;
        },
      },
    ],
  });
  return { source, reads: () => reads };
};

describe("isColumnarDataSource", () => {
  it("recognizes columnar sources without accepting invalid values", () => {
    const source = createColumnarDataSource({
      fields: [{ field: "id", data: ids }],
    });

    expect(isColumnarDataSource(source)).toBe(true);
    expect(isColumnarDataSource(null)).toBe(false);
    expect(isColumnarDataSource({})).toBe(false);
    expect(isColumnarDataSource({ kind: "client", access: {} })).toBe(false);
    expect(isColumnarDataSource({ kind: "columnar", access: null })).toBe(false);
  });
});

describe("createColumnarDataSource", () => {
  it("validates schema in O(c) and reads no cell values on construction", () => {
    const { source, reads } = makeSource();
    expect(source.access.rowCount).toBe(5);
    expect(source.access.fields).toEqual(["id", "name", "score"]);
    expect(reads()).toBe(0);
  });

  it("retains borrowed arrays by reference", () => {
    const source = createColumnarDataSource({ fields: [{ field: "id", data: ids }] });
    expect(source.access.getValue(2, "id")).toBe(3);
  });

  it("preserves a typed-array view buffer, offset and length", () => {
    const backing = new Float64Array([9, 8, 7, 6, 5, 4]);
    const view = backing.subarray(1, 4);
    const source = createColumnarDataSource({
      fields: [{ field: "v", data: view }],
      rowCount: 3,
    });
    expect(view.buffer).toBe(backing.buffer);
    expect(view.byteOffset).toBe(8);
    expect(view.length).toBe(3);
    expect(source.access.getValue(0, "v")).toBe(8);
    expect(source.access.getValue(2, "v")).toBe(6);
  });

  it("infers row count from declared field lengths", () => {
    const source = createColumnarDataSource({
      fields: [{ field: "id", data: ids }, { field: "name", data: names }],
    });
    expect(source.access.rowCount).toBe(5);
  });

  it("rejects duplicate field keys", () => {
    expect(() =>
      createColumnarDataSource({
        fields: [{ field: "a", data: [] }, { field: "a", data: [] }],
        rowCount: 0,
      }),
    ).toThrow(/Duplicate columnar field/);
  });

  it("rejects inconsistent declared lengths", () => {
    expect(() =>
      createColumnarDataSource({
        fields: [
          { field: "a", data: [1, 2, 3] },
          { field: "b", data: [1] },
        ],
      }),
    ).toThrow(/inconsistent lengths/);
  });

  it("rejects an accessor field with no declared length or rowCount", () => {
    expect(() =>
      createColumnarDataSource({ fields: [{ field: "a", getValue: () => 1 }] }),
    ).toThrow(/rowCount/);
  });

  it("rejects a field with neither data nor accessor", () => {
    expect(() =>
      createColumnarDataSource({ fields: [{ field: "a" }], rowCount: 3 }),
    ).toThrow(/data/);
  });

  it("materializes a record only through the explicit getRecord opt-in", () => {
    const { source, reads } = makeSource();
    expect(source.getRecord(1)).toEqual({ id: 2, name: "Bob", score: 20 });
    expect(reads()).toBe(1);
  });

  it("returns an identity access for an unsorted/unfiltered query with no cell reads", async () => {
    const { source, reads } = makeSource();
    const response = await source.query({ range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER } });
    expect(response.rows).toEqual([]);
    expect(response.totalRows).toBe(5);
    expect(response.access).toBeDefined();
    expect(reads()).toBe(0);
    expect(response.access!.getValue(3, "name")).toBe("Diana");
  });

  it("sorts through source indices without mutating the borrowed arrays", async () => {
    const { source } = makeSource();
    const before = [...scores];
    const response = await source.query({
      range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER },
      sort: [{ colId: "score", direction: "asc" }],
    });
    expect(response.access!.rowCount).toBe(5);
    const ordered = Array.from({ length: 5 }, (_, i) => response.access!.getValue(i, "score"));
    expect(ordered).toEqual([10, 20, 30, 40, 50]);
    expect(scores).toEqual(before);
  });

  it("filters through source indices and reports the filtered count", async () => {
    const { source } = makeSource();
    const response = await source.query({
      range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER },
      filter: {
        score: { groups: [{ combination: "and", conditions: [{ type: "number", operator: ">=", value: 30 }] }], combination: "and" },
      },
    });
    expect(response.totalRows).toBe(3);
  });

  it("resolves a column id through the request fieldMap", async () => {
    const { source } = makeSource();
    const response = await source.query({
      range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER },
      sort: [{ colId: "displayScore", direction: "asc" }],
      fieldMap: { displayScore: "score" },
    });
    expect(response.access!.getValue(0, "score")).toBe(10);
  });

  it("resolves identity lazily per row", () => {
    const { source } = makeSource();
    expect(source.access.getRowId?.(4)).toBe(5);
  });
});

describe("GridCore with a columnar source", () => {
  it("binds and renders without reading cells or materializing records", async () => {
    const { source, reads } = makeSource();
    const grid = new GridCore({
      columns,
      dataSource: source,
      rowHeight: 32,
      overscan: 2,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 800, 320);

    expect(grid.rows.getCount()).toBe(5);
    // Binding and slot sync must not read a single cell value.
    expect(reads()).toBe(0);
    expect(grid.rows.getData(0)).toBeUndefined();
    expect(grid.cells.getValue(0, 0)).toBe(1);
    expect(grid.cells.getValue(4, 2)).toBe(30);
    expect(grid.rows.getId(2)).toBe(3);
    expect(grid.rows.isWritable()).toBe(false);
  });

  it("sorts displayed order while leaving the source unchanged", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();
    await grid.sortFilter.setSort("score", "asc");

    const displayed = Array.from({ length: 5 }, (_, row) => grid.cells.getValue(row, 2));
    expect(displayed).toEqual([10, 20, 30, 40, 50]);
    expect(scores).toEqual([50, 20, 40, 10, 30]);
  });

  it("filters displayed rows while leaving the source unchanged", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();
    await grid.sortFilter.setFilter("name", "a");

    const displayed = Array.from({ length: grid.rows.getCount() }, (_, row) => grid.cells.getValue(row, 1));
    expect(displayed).toEqual(["Alice", "Charlie", "Diana"]);
  });

  it("reports an independent rejection for every write path", async () => {
    const { source } = makeSource();
    const rejected: CellWriteRejectedEvent[] = [];
    const changed: CellValueChangedEvent<never>[] = [];
    const grid = new GridCore({
      columns,
      dataSource: source,
      rowHeight: 32,
      onWriteRejected: (event) => rejected.push(event),
      // Required by the config when onCellValueChanged is present; the
      // read-only source must never invoke it.
      getRowId: () => 0,
      onCellValueChanged: (event) => changed.push(event),
    });
    await grid.initialize();

    // Direct setter.
    grid.cells.setValue(0, 1, "Mallory");
    expect(grid.cells.getValue(0, 1)).toBe("Alice");
    expect(rejected).toEqual([
      expect.objectContaining({
        row: 0,
        col: 1,
        field: "name",
        reason: "read-only-source",
        operation: "setCellValue",
      }),
    ]);

    // Edit activation on an editable column of a read-only source.
    rejected.length = 0;
    grid.edit.start(0, 1);
    expect(grid.edit.getState()).toBeNull();
    expect(rejected).toEqual([
      expect.objectContaining({ row: 0, col: 1, field: "name", operation: "edit" }),
    ]);

    // Paste into the active cell.
    rejected.length = 0;
    grid.selection.startSelection({ row: 0, col: 1 });
    expect(grid.edit.paste("Mallory")).toBe(false);
    expect(rejected).toEqual([
      expect.objectContaining({ row: 0, col: 1, field: "name", operation: "paste" }),
    ]);

    // Fill drag start.
    rejected.length = 0;
    grid.fill.startFillDrag({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
    expect(grid.fill.isActive()).toBe(false);
    expect(rejected).toEqual([
      expect.objectContaining({ row: 0, col: 1, field: "name", operation: "fill" }),
    ]);

    // Source row move.
    rejected.length = 0;
    grid.rowDrag.commit(0, 2);
    expect(rejected).toEqual([
      expect.objectContaining({ row: 0, col: -1, operation: "row-move" }),
    ]);

    // No attempted operation produced a successful change event.
    expect(changed).toEqual([]);
    expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana", "Eve"]);
    expect(scores).toEqual([50, 20, 40, 10, 30]);
  });

  it("does not report a rejection for a disabled, non-editable column", async () => {
    const { source } = makeSource();
    const rejected: CellWriteRejectedEvent[] = [];
    const grid = new GridCore({
      columns,
      dataSource: source,
      rowHeight: 32,
      onWriteRejected: (event) => rejected.push(event),
    });
    await grid.initialize();

    // Column 0 (id) is not editable, so the control is disabled: no event.
    grid.edit.start(0, 0);
    expect(grid.edit.getState()).toBeNull();
    expect(rejected).toEqual([]);
  });

  it("re-binds a new revision explicitly on refresh", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();

    names[0] = "Alicia";
    source.setRevision(1);
    await grid.refresh();

    expect(source.revision).toBe(1);
    expect(grid.cells.getValue(0, 1)).toBe("Alicia");
  });
});

const INDEX_KEY = /^\d+$/;

/**
 * Wrap a borrowed store so every numeric cell read is observable. The grid
 * keeps the proxy as-is, so a hidden full copy or eager scan would show up as
 * reads performed at construction/bind time instead of per requested cell.
 */
const countingReads = <T extends object>(target: T) => {
  let reads = 0;
  const data = new Proxy(target, {
    get(source, property) {
      if (typeof property === "string" && INDEX_KEY.test(property)) reads += 1;
      return Reflect.get(source, property, source);
    },
  });
  return { data, reads: () => reads };
};

describe("borrowed storage and observable reads", () => {
  it("reads changed caller-owned arrays through a revision refresh", async () => {
    const names = ["Ada", "Grace", "Linus"];
    const scores = [10, 20, 30];
    const nameStore = countingReads(names);
    let scoreReads = 0;
    const source = createColumnarDataSource({
      fields: [
        { field: "name", data: nameStore.data },
        {
          field: "score",
          getValue: (row) => {
            scoreReads += 1;
            return scores[row]!;
          },
        },
      ],
    });
    const grid = new GridCore({
      columns: [
        { field: "name", cellDataType: "text", width: 120 },
        { field: "score", cellDataType: "number", width: 80 },
      ],
      dataSource: source,
      rowHeight: 32,
    });

    await grid.initialize();
    grid.setViewport(0, 0, 400, 96);
    // Construction, binding and the first window read no cells: a mandatory
    // deferred scan or eager full copy would be visible here.
    expect(nameStore.reads()).toBe(0);
    expect(scoreReads).toBe(0);

    names[1] = "Grace Hopper";
    scores[1] = 99;
    source.setRevision(1);
    await grid.refresh();

    // A revision refresh re-reads metadata, not the whole column.
    expect(nameStore.reads()).toBe(0);

    expect(grid.cells.getValue(1, 0)).toBe("Grace Hopper");
    expect(grid.cells.getValue(1, 1)).toBe(99);
    // Reading one cell reads exactly one borrowed value and one accessor value.
    expect(nameStore.reads()).toBe(1);
    expect(scoreReads).toBe(1);
  });

  it("reads a nonzero-offset typed-array view at its own boundaries", async () => {
    const backing = new Float64Array([111, 222, 3, 4, 5, 6, 777, 888]);
    const view = backing.subarray(2, 6);
    const store = countingReads(view);
    const source = createColumnarDataSource({
      rowCount: 4,
      fields: [{ field: "v", data: store.data }],
    });

    expect(store.reads()).toBe(0);

    const grid = new GridCore({
      columns: [{ field: "v", cellDataType: "number", width: 80 }],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    grid.setViewport(0, 0, 200, 128);
    expect(store.reads()).toBe(0);

    // Values come from the view's offset, not the backing buffer start.
    expect(source.access.getValue(0, "v")).toBe(3);
    expect(source.access.getValue(3, "v")).toBe(6);
    expect(store.reads()).toBe(2);
    // Reads outside the declared view are null, never a neighbour's value.
    expect(source.access.getValue(-1, "v")).toBeNull();
    expect(source.access.getValue(4, "v")).toBeNull();
    expect(store.reads()).toBe(2);

    backing[2] = 30;
    backing[5] = 60;
    // Values just outside the view must never leak into a cell.
    backing[1] = 999;
    backing[6] = 888;
    source.setRevision(1);
    await grid.refresh();

    expect(grid.cells.getValue(0, 0)).toBe(30);
    expect(grid.cells.getValue(3, 0)).toBe(60);
    // The caller's view keeps its own buffer, offset and length.
    expect(view.buffer).toBe(backing.buffer);
    expect(view.byteOffset).toBe(16);
    expect(view.length).toBe(4);

    grid.destroy();
    // Teardown never detaches or frees the caller's buffer.
    expect(backing[2]).toBe(30);
  });

  it("never materializes records and resolves identity lazily", async () => {
    const names = ["Ada", "Grace", "Linus"];
    const scores = [30, 10, 20];
    let identityReads = 0;
    const source = createColumnarDataSource({
      fields: [
        { field: "name", data: names },
        { field: "score", data: scores },
      ],
      getRowId: (row) => {
        identityReads += 1;
        return row + 100;
      },
    });
    const getRecord = vi.spyOn(source, "getRecord");
    const grid = new GridCore({
      columns: [
        { field: "name", cellDataType: "text", width: 120 },
        { field: "score", cellDataType: "number", width: 80 },
      ],
      dataSource: source,
      rowHeight: 32,
    });

    await grid.initialize();
    grid.setViewport(0, 0, 400, 128);
    await grid.sortFilter.setSort("score", "asc");
    await grid.sortFilter.setFilter("name", "a");
    await grid.refresh();

    // No implicit record materialization on bind, render, sort, filter, refresh.
    expect(getRecord).not.toHaveBeenCalled();
    // Binding never enumerates rows to build an eager ID table.
    expect(identityReads).toBe(0);
    const id = grid.rows.getId(0);
    expect(typeof id).toBe("number");
    expect(identityReads).toBe(1);
  });
});

describe("columnar identity, revisions and field access", () => {
  const localColumns: ColumnDefinition[] = [
    { field: "name", cellDataType: "text", width: 160 },
    { field: "score", cellDataType: "number", width: 80 },
  ];

  it("adopts appended rows when a revision is revalidated", async () => {
    const ids = [1, 2];
    const rowNames = ["Ada", "Grace"];
    const source = createColumnarDataSource({
      fields: [
        { field: "id", data: ids },
        { field: "name", data: rowNames },
      ],
    });
    const grid = new GridCore({
      columns: [
        { field: "id", cellDataType: "number", width: 60 },
        ...localColumns,
      ],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    expect(grid.rows.getCount()).toBe(2);

    ids.push(3);
    rowNames.push("Linus");
    source.setRevision(1);
    await grid.refresh();

    expect(source.revision).toBe(1);
    expect(grid.rows.getCount()).toBe(3);
    expect(grid.cells.getFieldValue(2, "name")).toBe("Linus");
  });

  it("adopts removed rows when a revision is revalidated", async () => {
    const rowNames = ["Ada", "Grace", "Linus"];
    const source = createColumnarDataSource({
      fields: [{ field: "name", data: rowNames }],
    });
    const grid = new GridCore({
      columns: [{ field: "name", cellDataType: "text", width: 160 }],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    expect(grid.rows.getCount()).toBe(3);

    rowNames.pop();
    source.setRevision(1);
    await grid.refresh();

    expect(grid.rows.getCount()).toBe(2);
  });

  it("falls back to source-position identity preserved through sort", async () => {
    const source = createColumnarDataSource({
      fields: [
        { field: "name", data: ["c", "a", "b"] },
        { field: "score", data: [30, 10, 20] },
      ],
    });
    const grid = new GridCore({
      columns: localColumns,
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();

    expect(grid.rows.getId(0)).toBe(0);
    expect(grid.rows.getId(2)).toBe(2);

    await grid.sortFilter.setSort("score", "asc");
    // Source positions reordered by score: [1]=10, [2]=20, [0]=30.
    expect([
      grid.rows.getId(0),
      grid.rows.getId(1),
      grid.rows.getId(2),
    ]).toEqual([1, 2, 0]);
  });

  it("applies a caller-provided identity accessor through the projection", async () => {
    const ids = [100, 200, 300];
    const source = createColumnarDataSource({
      getRowId: (sourceRow) => ids[sourceRow]!,
      fields: [
        { field: "id", data: ids },
        { field: "score", data: [30, 10, 20] },
      ],
    });
    const grid = new GridCore({
      columns: localColumns,
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    await grid.sortFilter.setSort("score", "asc");

    expect([
      grid.rows.getId(0),
      grid.rows.getId(1),
      grid.rows.getId(2),
    ]).toEqual([200, 300, 100]);
  });

  it("reads a source field that has no grid column", async () => {
    const source = createColumnarDataSource({
      fields: [
        { field: "id", data: [1, 2] },
        { field: "score", data: [10, 20] },
      ],
    });
    // No column is defined for "score".
    const grid = new GridCore({
      columns: [{ field: "id", cellDataType: "number", width: 60 }],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();

    expect(grid.cells.getFieldValue(1, "score")).toBe(20);
    expect(grid.cells.getFieldValue(1, "missing")).toBeNull();
  });

  it("updates an explicit row count when a revision is adopted", async () => {
    const ids = [1, 2];
    const source = createColumnarDataSource({
      rowCount: 2,
      fields: [{ field: "id", data: ids }],
    });
    const grid = new GridCore({
      columns: [{ field: "id", cellDataType: "number", width: 60 }],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    expect(grid.rows.getCount()).toBe(2);

    ids.push(3);
    source.setRevision(1, 3);
    await grid.refresh();

    expect(grid.rows.getCount()).toBe(3);
    expect(grid.cells.getValue(2, 0)).toBe(3);
  });

  it("rejects an explicit row count that disagrees with a resident column", () => {
    const ids = [1, 2];
    const source = createColumnarDataSource({
      rowCount: 2,
      fields: [{ field: "id", data: ids }],
    });
    ids.push(3);

    expect(() => source.setRevision(1)).toThrow(/rowCount 2/);
    expect(() => source.setRevision(1, 4)).toThrow(/length 3/);
    // A rejected revision leaves the bound metadata intact.
    expect(source.access.rowCount).toBe(2);
    expect(source.revision).toBe(0);
  });

  it("updates an accessor-only source row count on a revision", async () => {
    const source = createColumnarDataSource({
      rowCount: 2,
      fields: [{ field: "value", getValue: (sourceRow) => sourceRow * 10 }],
    });
    const grid = new GridCore({
      columns: [{ field: "value", cellDataType: "number", width: 80 }],
      dataSource: source,
      rowHeight: 32,
    });
    await grid.initialize();
    expect(grid.rows.getCount()).toBe(2);

    source.setRevision(1, 3);
    await grid.refresh();

    expect(grid.rows.getCount()).toBe(3);
    expect(grid.cells.getFieldValue(2, "value")).toBe(20);
  });
});
