import { describe, expect, it, vi } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, HighlightContext } from "../src/types";

interface Row {
  id: number;
  name: string;
  age: number;
}

// Fresh array per grid: moveColumn reorders the columns in place.
const createColumns = (): ColumnDefinition[] => [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80 },
];

const classForColumn = (context: HighlightContext<Row>): string[] => [
  `col-${context.column?.field ?? "none"}`,
];

const createGrid = () => {
  const computeColumnClasses = vi.fn(classForColumn);
  const computeCellClasses = vi.fn(classForColumn);
  const core = new GridCore<Row>({
    columns: createColumns(),
    dataSource: createClientDataSource<Row>([{ id: 1, name: "Alice", age: 30 }]),
    rowHeight: 32,
    highlighting: { computeColumnClasses, computeCellClasses },
  });
  return { core, computeColumnClasses, computeCellClasses };
};

const columnAt = (core: GridCore<Row>, index: number): ColumnDefinition => {
  const column = core.getColumns()[index];
  if (column === undefined) throw new Error(`no column at ${index}`);
  return column;
};

describe("highlight caches across column moves", () => {
  it("recomputes column classes for the column now at that index", async () => {
    const { core, computeColumnClasses } = createGrid();
    await core.initialize();
    const highlight = core.highlight;
    if (highlight === null) throw new Error("highlighting not configured");

    expect(highlight.computeColumnClasses(0, columnAt(core, 0))).toEqual(["col-id"]);

    // id -> last; columns are now name, age, id
    core.moveColumn(0, 3);

    expect(highlight.computeColumnClasses(0, columnAt(core, 0))).toEqual(["col-name"]);
    expect(computeColumnClasses).toHaveBeenCalledTimes(2);
  });

  it("recomputes cell classes for the column now at that index", async () => {
    const { core, computeCellClasses } = createGrid();
    await core.initialize();
    const highlight = core.highlight;
    if (highlight === null) throw new Error("highlighting not configured");
    const row = core.getRowData(0);

    expect(highlight.computeCellClasses(0, 0, columnAt(core, 0), row)).toEqual(["col-id"]);

    core.moveColumn(0, 3);

    expect(highlight.computeCellClasses(0, 0, columnAt(core, 0), row)).toEqual(["col-name"]);
    expect(computeCellClasses).toHaveBeenCalledTimes(2);
  });

  it("keeps cached classes across a resize, which preserves column order", async () => {
    const { core, computeColumnClasses } = createGrid();
    await core.initialize();
    const highlight = core.highlight;
    if (highlight === null) throw new Error("highlighting not configured");

    highlight.computeColumnClasses(0, columnAt(core, 0));
    core.setColumnWidth(0, 120);
    highlight.computeColumnClasses(0, columnAt(core, 0));

    expect(computeColumnClasses).toHaveBeenCalledTimes(1);
  });
});
