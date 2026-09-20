import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type { ColumnDefinition, DataSource, DataSourceRequest, GridInstruction } from "../src/types";

interface Row {
  id: number;
  name: string;
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: index, name: `Row ${index}` }));

const columns = (width = 100): ColumnDefinition[] => [
  { field: "id", cellDataType: "number", width },
  { field: "name", cellDataType: "text", width },
];

interface Harness {
  grid: GridCore<Row>;
  instructions: GridInstruction[];
  queries: () => number;
}

const createGrid = (
  options: { rowCount?: number; viewportWidth?: number; columnLayout?: "fit" | "fixed" } = {},
): Harness => {
  const source: DataSource<Row> = {
    query: async (request: DataSourceRequest) => {
      queryCount += 1;
      const data = rows(options.rowCount ?? 1_000);
      const start = Math.max(0, request.range.startRow);
      const end = Math.min(request.range.endRow, data.length);
      return { rows: data.slice(start, end), totalRows: data.length };
    },
  };
  let queryCount = 0;
  const grid = new GridCore<Row>({
    columns: columns(),
    dataSource: source,
    rowHeight: 32,
    headerHeight: 32,
    overscan: 3,
    columnLayout: options.columnLayout ?? "fit",
  });
  const instructions: GridInstruction[] = [];
  grid.onBatchInstruction((batch) => instructions.push(...batch));
  return { grid, instructions, queries: () => queryCount };
};

const typesOf = (instructions: GridInstruction[]): string[] =>
  instructions.map((instruction) => instruction.type);

describe("geometry viewport updates", () => {
  it("performs no row work for a horizontal-only update (AC-003-05)", async () => {
    const harness = createGrid();
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);

    const queriesBefore = harness.queries();
    harness.instructions.length = 0;
    harness.grid.setViewport(0, 120, 400, 320);

    expect(harness.queries()).toBe(queriesBefore);
    const types = typesOf(harness.instructions);
    expect(types).not.toContain("ASSIGN_SLOT");
    expect(types).not.toContain("MOVE_SLOT");
    expect(types).not.toContain("CREATE_SLOT");
  });

  it("keeps the same row window across horizontal-only updates", async () => {
    const harness = createGrid();
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);
    const window = harness.grid.geometry.getRowWindow();

    for (let step = 1; step <= 20; step += 1) {
      harness.grid.setViewport(0, step * 30, 400, 320);
      expect(harness.grid.geometry.getRowWindow()).toEqual(window);
    }
  });

  it("rebuilds the column layout once while raw scrolling (AC-003-06)", async () => {
    const harness = createGrid({ rowCount: 1_000 });
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);

    const first = harness.grid.geometry.getColumnLayout();
    for (let step = 1; step <= 1_000; step += 1) {
      harness.grid.setViewport(0, step, 400, 320);
      // Object identity is the reuse contract: a rebuild returns a new snapshot.
      expect(harness.grid.geometry.getColumnLayout()).toBe(first);
    }
    expect(harness.grid.geometry.getColumnLayout().revision).toBe(first.revision);
  });

  it("updates the layout when the same window gets a new width", async () => {
    const harness = createGrid();
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);
    const before = harness.grid.geometry.getColumnLayout();
    expect(before.totalWidth).toBe(400);

    const after = (() => {
      harness.grid.setViewport(0, 0, 800, 320);
      return harness.grid.geometry.getColumnLayout();
    })();

    expect(after).not.toBe(before);
    expect(after.totalWidth).toBe(800);
    expect(harness.grid.geometry.revision).toBeGreaterThan(before.revision);
  });

  it("publishes viewport dimensions without row work when every column is overridden", async () => {
    const harness = createGrid({ columnLayout: "fixed" });
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);
    harness.grid.setColumnState([{ columnId: "id", width: 100 }, { columnId: "name", width: 100 }]);

    const queriesBefore = harness.queries();
    harness.instructions.length = 0;
    harness.grid.setViewport(0, 0, 640, 320);

    expect(harness.queries()).toBe(queriesBefore);
    const types = typesOf(harness.instructions);
    expect(types).not.toContain("ASSIGN_SLOT");
    expect(types).not.toContain("MOVE_SLOT");
    expect(harness.grid.geometry.getColumnLayout().totalWidth).toBe(200);
    const contentSize = harness.instructions.find((i) => i.type === "SET_CONTENT_SIZE");
    expect(contentSize?.type === "SET_CONTENT_SIZE" ? contentSize.viewportWidth : -1).toBe(640);
  });

  it("publishes both layout and row updates for a combined change", async () => {
    const harness = createGrid();
    await harness.grid.initialize();
    harness.grid.setViewport(0, 0, 400, 320);
    const windowBefore = harness.grid.geometry.getRowWindow();

    harness.instructions.length = 0;
    harness.grid.setViewport(640, 0, 800, 480);

    const types = typesOf(harness.instructions);
    expect(types).toContain("SET_CONTENT_SIZE");
    expect(harness.instructions.some(
      (instruction) =>
        instruction.type === "SET_CONTENT_SIZE"
        && instruction.width === 800
        && instruction.viewportHeight === 480,
    )).toBe(true);
    expect(harness.grid.geometry.getRowWindow()).not.toEqual(windowBefore);
  });
});
