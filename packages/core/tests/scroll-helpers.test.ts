import { describe, expect, it } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { scrollCellIntoView } from "../src/utils/scroll-helpers";
import type { ColumnDefinition } from "../src/types";

interface Row {
  id: number;
  a: string;
  b: string;
}

const column = (field: string, width: number): ColumnDefinition => ({
  field,
  cellDataType: "text",
  width,
});

const createGrid = (rowCount = 100): GridCore<Row> =>
  new GridCore<Row>({
    columns: [column("id", 100), column("a", 100), column("b", 100)],
    dataSource: createClientDataSource(
      Array.from({ length: rowCount }, (_, index) => ({
        id: index,
        a: `a${index}`,
        b: `b${index}`,
      })),
    ),
    rowHeight: 32,
  });

const createContainer = (clientWidth = 300): HTMLElement => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: 320 });
  return el;
};

describe("scrollCellIntoView", () => {
  it("scrolls vertically to a row below the viewport", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const container = createContainer();

    scrollCellIntoView(grid, container, 40, 0);

    // Row 40 ends at 1312; a 320 px viewport needs logical top 992.
    expect(container.scrollTop).toBe(992);
  });

  it("leaves a fully visible cell untouched", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const container = createContainer();

    scrollCellIntoView(grid, container, 1, 0);

    expect(container.scrollTop).toBe(0);
    expect(container.scrollLeft).toBe(0);
  });

  it("assigns both axes from the supplied DOM sample", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const container = createContainer();

    scrollCellIntoView(grid, container, 40, 2, { scrollTop: 0, scrollLeft: 0 });

    expect(container.scrollTop).toBe(992);
    // Column 2 ends at 300, exactly the viewport width: already visible.
    expect(container.scrollLeft).toBe(0);
  });

  it("scrolls horizontally for an oversized cell", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 150, 320);
    const container = createContainer(150);

    scrollCellIntoView(grid, container, 0, 2);

    expect(container.scrollLeft).toBe(150);
  });

  it("ignores an invalid row and an invalid column", async () => {
    const grid = createGrid();
    await grid.initialize();
    grid.setViewport(0, 0, 300, 320);
    const container = createContainer();
    container.scrollLeft = 40;

    scrollCellIntoView(grid, container, 9999, 0);
    scrollCellIntoView(grid, container, 0, 99);

    expect(container.scrollTop).toBe(0);
    expect(container.scrollLeft).toBe(40);
  });
});
