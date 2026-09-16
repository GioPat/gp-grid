// packages/core/tests/columnar-data-source.test.ts

import { describe, it, expect } from "vitest";
import { GridCore } from "../src/grid-core";
import { createColumnarDataSource } from "../src/data-source";
import type { ColumnDefinition } from "../src/types";

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

  it("resolves a ColumnId through the request fieldMap", async () => {
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

    expect(grid.getRowCount()).toBe(5);
    // Binding and slot sync must not read a single cell value.
    expect(reads()).toBe(0);
    expect(grid.getRowData(0)).toBeUndefined();
    expect(grid.getCellValue(0, 0)).toBe(1);
    expect(grid.getCellValue(4, 2)).toBe(30);
    expect(grid.getRowId(2)).toBe(3);
    expect(grid.isWritable()).toBe(false);
  });

  it("sorts displayed order while leaving the source unchanged", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();
    await grid.setSort("score", "asc");

    const displayed = Array.from({ length: 5 }, (_, row) => grid.getCellValue(row, 2));
    expect(displayed).toEqual([10, 20, 30, 40, 50]);
    expect(scores).toEqual([50, 20, 40, 10, 30]);
  });

  it("filters displayed rows while leaving the source unchanged", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();
    await grid.setFilter("name", "a");

    const displayed = Array.from({ length: grid.getRowCount() }, (_, row) => grid.getCellValue(row, 1));
    expect(displayed).toEqual(["Alice", "Charlie", "Diana"]);
  });

  it("rejects every write path and reports the rejection", async () => {
    const { source } = makeSource();
    const rejected: Array<{ row: number; col: number; field: string; reason: string }> = [];
    const grid = new GridCore({
      columns,
      dataSource: source,
      rowHeight: 32,
      onWriteRejected: (event) => rejected.push(event),
    });
    await grid.initialize();

    grid.startEdit(0, 1);
    expect(grid.getEditState()).toBeNull();

    grid.setCellValue(0, 1, "Mallory");
    expect(grid.getCellValue(0, 1)).toBe("Alice");

    grid.selection.startSelection({ row: 0, col: 1 });
    const pasted = grid.pasteClipboardText("Mallory");
    expect(pasted).toBe(false);

    grid.fill.startFillDrag({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
    expect(grid.fill.isActive()).toBe(false);

    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((event) => event.reason === "read-only-source")).toBe(true);
    expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana", "Eve"]);
  });

  it("re-binds a new revision explicitly on refresh", async () => {
    const { source } = makeSource();
    const grid = new GridCore({ columns, dataSource: source, rowHeight: 32 });
    await grid.initialize();

    names[0] = "Alicia";
    source.setRevision(1);
    await grid.refresh();

    expect(source.revision).toBe(1);
    expect(grid.getCellValue(0, 1)).toBe("Alicia");
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
    expect(grid.getRowCount()).toBe(2);

    ids.push(3);
    rowNames.push("Linus");
    source.setRevision(1);
    await grid.refresh();

    expect(source.revision).toBe(1);
    expect(grid.getRowCount()).toBe(3);
    expect(grid.getFieldValue(2, "name")).toBe("Linus");
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
    expect(grid.getRowCount()).toBe(3);

    rowNames.pop();
    source.setRevision(1);
    await grid.refresh();

    expect(grid.getRowCount()).toBe(2);
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

    expect(grid.getRowId(0)).toBe(0);
    expect(grid.getRowId(2)).toBe(2);

    await grid.setSort("score", "asc");
    // Source positions reordered by score: [1]=10, [2]=20, [0]=30.
    expect([
      grid.getRowId(0),
      grid.getRowId(1),
      grid.getRowId(2),
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
    await grid.setSort("score", "asc");

    expect([
      grid.getRowId(0),
      grid.getRowId(1),
      grid.getRowId(2),
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

    expect(grid.getFieldValue(1, "score")).toBe(20);
    expect(grid.getFieldValue(1, "missing")).toBeNull();
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
    expect(grid.getRowCount()).toBe(2);

    ids.push(3);
    source.setRevision(1, 3);
    await grid.refresh();

    expect(grid.getRowCount()).toBe(3);
    expect(grid.getCellValue(2, 0)).toBe(3);
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
    expect(grid.getRowCount()).toBe(2);

    source.setRevision(1, 3);
    await grid.refresh();

    expect(grid.getRowCount()).toBe(3);
    expect(grid.getFieldValue(2, "value")).toBe(20);
  });
});
