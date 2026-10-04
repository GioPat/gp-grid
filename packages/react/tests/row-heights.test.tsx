// packages/react/tests/row-heights.test.tsx

import { describe, it, expect } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition, RowHeightUpdate } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";
import { bodyAriaRowIndex, headerRowCount } from "./aria-rows";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

const ROW_COUNT = 100;
const ROW_HEIGHT = 32;

const rows: TestRow[] = Array.from({ length: ROW_COUNT }, (_, id) => ({
  id,
  name: `Name ${id}`,
  age: 20 + id,
}));

const columns: ColumnDefinition[] = [
  { colId: "id", field: "id", cellDataType: "number", width: 60 },
  { colId: "name", field: "name", cellDataType: "text", width: 150 },
  { colId: "age", field: "age", cellDataType: "number", width: 80 },
];

type GridHandle = MutableRefObject<GridRef<TestRow> | null>;

const requireElement = <T extends Element>(element: T | null, name: string): T => {
  if (element === null) throw new Error(`${name} is not mounted`);
  return element;
};

const renderGrid = async (
  overrides: Partial<GridProps<TestRow>> = {},
): Promise<GridHandle> => {
  const gridRef: GridHandle = { current: null };
  render(
    <Grid
      columns={columns}
      dataSource={createClientDataSource(rows)}
      rowHeight={ROW_HEIGHT}
      getRowId={(row) => row.id}
      gridRef={gridRef}
      {...overrides}
    />,
  );
  await waitFor(() => {
    expect(document.querySelectorAll(".gp-grid-cell").length).toBeGreaterThan(0);
  });
  return gridRef;
};

const setHeights = async (
  gridRef: GridHandle,
  updates: readonly RowHeightUpdate[],
): Promise<void> => {
  await act(async () => {
    gridRef.current?.core.rowHeights.set(updates);
  });
};

const suffixRows = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".gp-grid-row")).filter(
    (row) => row.closest(".gp-grid-frozen-rows") === null,
  );

const rowBox = (viewIndex: number): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.gp-grid-row[aria-rowindex="${bodyAriaRowIndex(viewIndex)}"]`);

/** `translateY(...)` is local to the wrapper the row is mounted in. */
const localTop = (row: HTMLElement): number =>
  Number.parseFloat(row.style.transform.slice("translateY(".length));

const indexPathOf = (gridRef: GridHandle, rowId: number): number => {
  const core = gridRef.current?.core;
  const count = core?.rows.getCount() ?? 0;
  for (let index = 0; index < count; index += 1) {
    if (core?.rows.getId(index) === rowId) return index;
  }
  throw new Error(`row ${rowId} is not in the view`);
};

const contentSizer = (): HTMLElement =>
  requireElement(
    document.querySelector<HTMLElement>(".gp-grid-body-scroll")?.firstElementChild ?? null,
    "content sizer",
  );

describe("Grid row heights", () => {
  it("renders the applied heights on the row boxes and drops the inline cell height", async () => {
    const gridRef = await renderGrid();
    const before = contentSizer().style.height;

    await setHeights(gridRef, [
      { rowId: 2, height: 96 },
      { rowId: 5, height: 64 },
    ]);

    expect(rowBox(2)?.style.height).toBe("96px");
    expect(rowBox(5)?.style.height).toBe("64px");
    expect(rowBox(3)?.style.height).toBe("32px");

    const boxes = suffixRows();
    for (const box of boxes) {
      const viewIndex = Number(box.getAttribute("aria-rowindex")) - headerRowCount() - 1;
      const bounds = gridRef.current?.core.geometry.getRowBounds(viewIndex, "content");
      if (bounds === undefined) throw new Error(`row ${viewIndex} has no bounds`);
      expect(box.style.height).toBe(`${bounds.end - bounds.start}px`);
    }

    // The mounted boxes stay contiguous: each one starts where the previous ends.
    for (let index = 1; index < boxes.length; index += 1) {
      const previous = boxes[index - 1]!;
      const expectedTop = localTop(previous) + Number.parseFloat(previous.style.height);
      expect(localTop(boxes[index]!)).toBe(expectedTop);
    }

    for (const cell of document.querySelectorAll<HTMLElement>(".gp-grid-cell")) {
      expect(cell.style.height).toBe("");
    }

    // 96 + 64 - 2 * 32 of extra row extent reaches the scroll range.
    const grown = Number.parseFloat(contentSizer().style.height) - Number.parseFloat(before);
    expect(grown).toBe(96);
  });

  it("keeps a height with the row identity across a sort", async () => {
    const gridRef = await renderGrid();
    await setHeights(gridRef, [{ rowId: 97, height: 64 }]);

    await act(async () => {
      await gridRef.current?.core.sortFilter.setSort("id", "desc");
    });

    const index = indexPathOf(gridRef, 97);
    expect(index).toBe(2);
    expect(rowBox(index)?.style.height).toBe("64px");
    expect(rowBox(index - 1)?.style.height).toBe("32px");
    expect(rowBox(index + 1)?.style.height).toBe("32px");

    const stale = gridRef.current?.core.geometry.getRowBounds(97, "content");
    expect((stale?.end ?? 0) - (stale?.start ?? 0)).toBe(ROW_HEIGHT);
  });

  it("sizes the row drag ghost from the dragged row", async () => {
    const dragColumns: ColumnDefinition[] = [
      { colId: "id", field: "id", cellDataType: "number", width: 60, rowDrag: true },
      { colId: "name", field: "name", cellDataType: "text", width: 150 },
    ];
    const gridRef = await renderGrid({ columns: dragColumns });
    await setHeights(gridRef, [{ rowId: 0, height: 96 }]);

    const handle = requireElement(
      document.querySelector<HTMLElement>(
        '.gp-grid-rows-wrapper [data-cell-row="0"][data-cell-col="0"]',
      ),
      "row drag handle",
    );
    await act(async () => {
      fireEvent.pointerDown(handle, { clientX: 10, clientY: 10, button: 0, pointerId: 7 });
      fireEvent.pointerMove(document, { clientX: 10, clientY: 80, pointerId: 7 });
    });

    const ghost = requireElement(
      document.querySelector<HTMLElement>(".gp-grid-row-drag-ghost"),
      "row drag ghost",
    );
    expect(ghost.style.height).toBe("96px");
    expect(ghost.style.top).toBe("32px");

    await act(async () => {
      fireEvent.pointerUp(document, { clientX: 10, clientY: 80, pointerId: 7 });
    });
  });

  it("grows the frozen extent with a frozen row height", async () => {
    const gridRef = await renderGrid();
    await act(async () => {
      gridRef.current?.core.setFrozenRowsRequest({ requestedCount: 3 });
    });
    await setHeights(gridRef, [{ rowId: 1, height: 96 }]);

    const block = requireElement(
      document.querySelector<HTMLElement>(".gp-grid-frozen-rows"),
      "frozen block",
    );
    expect(block.style.height).toBe("160px");

    const frozenRow = requireElement(
      block.querySelector<HTMLElement>(`.gp-grid-row[aria-rowindex="${bodyAriaRowIndex(1)}"]`),
      "frozen row 1",
    );
    expect(frozenRow.style.height).toBe("96px");
    expect(frozenRow.querySelector<HTMLElement>(".gp-grid-cell")?.style.height).toBe("");
  });

  it("renders a grid without overrides as flat rows", async () => {
    const gridRef = await renderGrid();

    expect(gridRef.current?.core.rowHeights.getOverrides()).toEqual([]);

    const boxes = suffixRows();
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.style.height).toBe(`${ROW_HEIGHT}px`);
    }
    for (const cell of document.querySelectorAll<HTMLElement>(".gp-grid-cell")) {
      expect(cell.style.height).toBe("");
    }
  });
});
