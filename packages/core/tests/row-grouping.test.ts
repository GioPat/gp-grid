import { describe, expect, it } from "vitest";
import { RowGroupingManager } from "../src/row-grouping";
import type { ColumnDefinition } from "../src/types";

interface Row {
  id: number;
  country: string;
  city: string;
}

const rows: Row[] = [
  { id: 1, country: "Italy", city: "Rome" },
  { id: 2, country: "Italy", city: "Milan" },
  { id: 3, country: "France", city: "Paris" },
];

const columns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 120 },
  { field: "city", cellDataType: "text", width: 120 },
];

const createRowsMap = (): Map<number, Row> =>
  new Map(rows.map((row, index) => [index, row]));

describe("RowGroupingManager", () => {
  it("creates collapsed top-level group rows by default", () => {
    const manager = new RowGroupingManager<Row>({
      getColumns: () => columns,
      getCachedRows: createRowsMap,
      getTotalRows: () => rows.length,
    }, { columns: ["country"] });

    expect(manager.getRows()).toMatchObject([
      { kind: "group", value: "Italy", childCount: 2, expanded: false },
      { kind: "group", value: "France", childCount: 1, expanded: false },
    ]);
  });

  it("expands a group into data presentation rows", () => {
    const manager = new RowGroupingManager<Row>({
      getColumns: () => columns,
      getCachedRows: createRowsMap,
      getTotalRows: () => rows.length,
    }, { columns: ["country"] });

    const firstGroup = manager.getRows()[0];
    if (firstGroup?.kind !== "group") throw new Error("Expected group row");

    manager.toggle(firstGroup.groupKey);

    expect(manager.getRows()).toMatchObject([
      { kind: "group", value: "Italy", expanded: true },
      { kind: "data", rowIndex: 0 },
      { kind: "data", rowIndex: 1 },
      { kind: "group", value: "France", expanded: false },
    ]);
  });

  it("collapses groups that are expanded by default depth", () => {
    const manager = new RowGroupingManager<Row>({
      getColumns: () => columns,
      getCachedRows: createRowsMap,
      getTotalRows: () => rows.length,
    }, { columns: ["country"], defaultExpandedDepth: 1 });

    const firstGroup = manager.getRows()[0];
    if (firstGroup?.kind !== "group") throw new Error("Expected group row");
    expect(firstGroup.expanded).toBe(true);

    manager.toggle(firstGroup.groupKey);

    expect(manager.getRows()[0]).toMatchObject({
      kind: "group",
      value: "Italy",
      expanded: false,
    });
  });

  it("does not read source rows again when toggling expansion", () => {
    const cachedRows = createRowsMap();
    let rowReads = 0;
    const manager = new RowGroupingManager<Row>({
      getColumns: () => columns,
      getCachedRows: () => {
        rowReads += 1;
        return cachedRows;
      },
      getTotalRows: () => rows.length,
    }, { columns: ["country"] });

    const readsAfterBuild = rowReads;
    const firstGroup = manager.getRows()[0];
    if (firstGroup?.kind !== "group") throw new Error("Expected group row");

    manager.toggle(firstGroup.groupKey);

    expect(rowReads).toBe(readsAfterBuild);
  });
});
