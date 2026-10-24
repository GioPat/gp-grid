// packages/react/tests/auto-fit.test.tsx

import { describe, it, expect, afterEach, vi } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition, ColumnFitResult, GridCore, RowFitResult } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";

interface TestRow {
  id: number;
  name: string;
  age: number;
}

const ROW_HEIGHT = 32;

const rows: TestRow[] = Array.from({ length: 50 }, (_, id) => ({ id, name: `Name ${id}`, age: 20 + id }));

const columns: ColumnDefinition[] = [
  { colId: "id", field: "id", cellDataType: "number", width: 60, editable: true },
  { colId: "name", field: "name", cellDataType: "text", width: 150, headerName: "Full name" },
  { colId: "age", field: "age", cellDataType: "number", width: 80, resizable: false },
];

type GridHandle = MutableRefObject<GridRef<TestRow> | null>;

const gridProps = (
  gridRef: GridHandle,
  overrides: Partial<GridProps<TestRow>> = {},
): GridProps<TestRow> => ({
  columns,
  dataSource: createClientDataSource(rows),
  rowHeight: ROW_HEIGHT,
  columnLayout: "fixed",
  rowResize: true,
  getRowId: (row) => row.id,
  gridRef,
  ...overrides,
});

const mountedCells = (): number => document.querySelectorAll(".gp-grid-cell").length;

const renderGrid = async (
  overrides: Partial<GridProps<TestRow>> = {},
): Promise<GridCore<TestRow>> => {
  const gridRef: GridHandle = { current: null };
  render(<Grid {...gridProps(gridRef, overrides)} />);
  await waitFor(() => expect(mountedCells()).toBeGreaterThan(0));
  const core = gridRef.current?.core;
  if (!core) throw new Error("core is not mounted");
  return core;
};

const requireElement = <T extends Element>(element: T | null, name = "handle"): T => {
  if (element === null) throw new Error(`${name} is not mounted`);
  return element;
};

const columnHandle = (colIndex: number): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    `.gp-grid-header-cell[data-col-index="${colIndex}"] .gp-grid-header-resize-handle`,
  );

const bodyCell = (row: number, col: number): HTMLElement =>
  requireElement(
    document.querySelector<HTMLElement>(
      `.gp-grid-rows-wrapper [data-cell-row="${row}"][data-cell-col="${col}"]`,
    ),
    `cell ${row}:${col}`,
  );

const rowHandle = (row: number): HTMLElement | null =>
  bodyCell(row, 0).querySelector<HTMLElement>(".gp-grid-row-resize-handle");

const handle = requireElement<HTMLElement>;

const rowHandles = (selector = ".gp-grid-row-resize-handle"): Element[] =>
  Array.from(document.querySelectorAll(selector));

const gridRoot = (): HTMLElement =>
  requireElement(document.querySelector<HTMLElement>('[role="grid"]'), "grid root");

const widthOf = (core: GridCore<TestRow>, colIndex: number): number | undefined =>
  core.geometry.getColumn(colIndex)?.width;

const heightOf = (core: GridCore<TestRow>, rowIndex: number): number => {
  const bounds = core.geometry.getRowBounds(rowIndex, "content");
  if (bounds === undefined) throw new Error(`row ${rowIndex} has no bounds`);
  return bounds.end - bounds.start;
};

const activate = (core: GridCore<TestRow>, row: number, col: number): Promise<void> =>
  act(async () => core.selection.setActiveCell(row, col));

const pointer = { button: 0, pointerId: 3, pointerType: "mouse" } as const;

describe("Grid edge handles and fit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders pointer-only handles on both axes", async () => {
    const core = await renderGrid();
    const a11yAttributes = ["role", "aria-label", "aria-orientation", "aria-valuenow", "tabindex"];

    const name = handle(columnHandle(1));
    const row = handle(rowHandle(2));
    for (const element of [name, row]) {
      expect(element.getAttribute("aria-hidden")).toBe("true");
      for (const attribute of a11yAttributes) expect(element.hasAttribute(attribute)).toBe(false);
    }
    expect(columnHandle(2)).toBeNull();

    await act(async () => core.edit.start(2, 0));
    expect(rowHandle(2)).toBeNull();
    expect(bodyCell(2, 1).querySelector(".gp-grid-row-resize-handle")).not.toBeNull();
    expect(rowHandle(3)).not.toBeNull();
  });

  it("renders the row handle in every cell of every region and the frozen band", async () => {
    await renderGrid({
      columnState: [{ columnId: "id", pinned: "start" }, { columnId: "age", pinned: "end" }],
      freezeRows: { count: 2 },
    });
    const cells = Array.from(document.querySelectorAll<HTMLElement>(".gp-grid-cell"));

    expect(new Set(cells.map((cell) => cell.dataset.cellRegion))).toEqual(new Set(["start", "center", "end"]));
    expect(cells.filter((cell) => cell.closest(".gp-grid-frozen-rows, .gp-grid-frozen-pins"))).toHaveLength(6);
    for (const cell of cells) expect(cell.querySelectorAll(".gp-grid-row-resize-handle")).toHaveLength(1);
  });

  it("adds and removes every row handle and gates Alt+ArrowDown with the rowResize prop", async () => {
    const gridRef: GridHandle = { current: null };
    const dataSource = createClientDataSource(rows);
    const view = render(<Grid {...gridProps(gridRef, { dataSource, rowResize: false })} />);
    await waitFor(() => expect(mountedCells()).toBeGreaterThan(0));
    const core = gridRef.current?.core;
    if (!core) throw new Error("core is not mounted");
    const altDown = () => act(async () => void fireEvent.keyDown(gridRoot(), { key: "ArrowDown", altKey: true }));
    await activate(core, 2, 1);

    expect(rowHandles()).toHaveLength(0);
    await altDown();
    expect(heightOf(core, 2)).toBe(ROW_HEIGHT);

    view.rerender(<Grid {...gridProps(gridRef, { dataSource, rowResize: true })} />);
    expect(gridRef.current?.core).toBe(core);
    expect(rowHandles()).toHaveLength(mountedCells());
    await altDown();
    expect(heightOf(core, 2)).toBe(ROW_HEIGHT + 4);

    view.rerender(<Grid {...gridProps(gridRef, { dataSource, rowResize: false })} />);
    expect(rowHandles()).toHaveLength(0);
    await altDown();
    expect(heightOf(core, 2)).toBe(ROW_HEIGHT + 4);
    expect(core.selection.getActiveCell()).toEqual({ row: 2, col: 1 });
  });

  it("fits on a handle double-click without reaching the cell", async () => {
    const core = await renderGrid();
    const fitColumns = vi.spyOn(core.columns, "fit");
    const fitRows = vi.spyOn(core.rowHeights, "fit");
    const cellDoubleClick = vi.spyOn(core.input, "handleCellDoubleClick");

    fireEvent.doubleClick(handle(columnHandle(1)));
    fireEvent.doubleClick(handle(rowHandle(2)));

    expect(fitColumns).toHaveBeenCalledWith(["name"]);
    expect(fitRows).toHaveBeenCalledWith([2]);
    expect(cellDoubleClick).not.toHaveBeenCalled();
    expect(core.edit.getState()).toBeNull();

    fireEvent.doubleClick(bodyCell(2, 0));
    expect(cellDoubleClick).toHaveBeenCalledWith(2, 0);
  });

  it("resizes the active cell's row and column with Alt+Arrow on the grid", async () => {
    const onColumnResized = vi.fn();
    const onRowResized = vi.fn();
    const core = await renderGrid({ onColumnResized, onRowResized });
    await activate(core, 2, 0);

    await act(async () => {
      fireEvent.keyDown(gridRoot(), { key: "ArrowDown", altKey: true });
      fireEvent.keyDown(gridRoot(), { key: "ArrowDown", altKey: true });
      fireEvent.keyDown(gridRoot(), { key: "ArrowRight", altKey: true });
    });

    expect(heightOf(core, 2)).toBe(ROW_HEIGHT + 8);
    expect(onRowResized).toHaveBeenCalledTimes(2);
    expect(widthOf(core, 0)).toBe(68);
    expect(onColumnResized).toHaveBeenCalledWith({ columnId: "id", width: 68, viewIndex: 0 });
    expect(core.selection.getActiveCell()).toEqual({ row: 2, col: 0 });
  });

  it("fits the active cell's column and row with Alt+Enter and Alt+Shift+Enter", async () => {
    const onColumnResized = vi.fn();
    const onRowResized = vi.fn();
    const core = await renderGrid({ onColumnResized, onRowResized });
    const fitColumns = vi.spyOn(core.columns, "fit");
    const fitRows = vi.spyOn(core.rowHeights, "fit");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 210, 48),
    );
    await activate(core, 2, 1);

    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.keyDown(gridRoot(), { key: "Enter", altKey: true });
    });
    expect(notPrevented).toBe(false);
    await act(async () => {
      fireEvent.keyDown(gridRoot(), { key: "Enter", altKey: true, shiftKey: true });
    });

    expect(fitColumns).toHaveBeenCalledWith(["name"]);
    expect(fitRows).toHaveBeenCalledWith([2]);
    expect(onColumnResized).toHaveBeenCalledWith({ columnId: "name", width: 210, viewIndex: 1 });
    expect(onRowResized).toHaveBeenCalledWith({ rowId: 2, height: 48, viewIndex: 2 });
    expect(core.edit.getState()).toBeNull();
    expect(core.selection.getActiveCell()).toEqual({ row: 2, col: 1 });
  });

  it("commits nothing for a press without movement on either handle", async () => {
    const onColumnResized = vi.fn();
    const onRowResized = vi.fn();
    const core = await renderGrid({ onColumnResized, onRowResized });
    const cellPointerDown = vi.spyOn(core.input, "handleCellMouseDown");

    await act(async () => {
      fireEvent.pointerDown(handle(columnHandle(1)), { ...pointer, clientX: 210, clientY: 10 });
      fireEvent.pointerUp(document, { ...pointer, clientX: 210, clientY: 10 });
      fireEvent.pointerDown(handle(rowHandle(2)), { ...pointer, clientX: 30, clientY: 100 });
      fireEvent.pointerUp(document, { ...pointer, clientX: 30, clientY: 100 });
    });

    expect(onColumnResized).not.toHaveBeenCalled();
    expect(onRowResized).not.toHaveBeenCalled();
    expect(cellPointerDown).not.toHaveBeenCalled();
    expect(core.rowHeights.getOverrides()).toEqual([]);
  });

  it("drags a row edge with a preview line below the header", async () => {
    const onRowResized = vi.fn();
    const core = await renderGrid({ onRowResized });

    await act(async () => {
      fireEvent.pointerDown(handle(rowHandle(2)), { ...pointer, clientX: 30, clientY: 100 });
      fireEvent.pointerMove(document, { ...pointer, clientX: 30, clientY: 140 });
    });
    const lineY = core.input.getDragState().rowResize?.lineY;
    const line = requireElement(document.querySelector<HTMLElement>(".gp-grid-row-resize-line"), "line");
    expect(line.style.top).toBe(`${ROW_HEIGHT + (lineY ?? Number.NaN)}px`);
    const active = rowHandles(".gp-grid-row-resize-handle--active");
    expect(active).toHaveLength(document.querySelectorAll('[data-cell-row="2"]').length);
    expect(active.every((element) => element.closest('[data-cell-row="2"]') !== null)).toBe(true);

    await act(async () => {
      fireEvent.pointerUp(document, { ...pointer, clientX: 30, clientY: 140 });
    });
    expect(heightOf(core, 2)).toBe(ROW_HEIGHT + 40);
    expect(onRowResized).toHaveBeenCalledTimes(1);
    expect(onRowResized).toHaveBeenCalledWith({ rowId: 2, height: ROW_HEIGHT + 40, viewIndex: 2 });
    expect(document.querySelector(".gp-grid-row-resize-line")).toBeNull();
  });

  // A root revision that lagged the core's would make both fits "stale".
  it("gives a recreated core a measurement host", async () => {
    const gridRef: GridHandle = { current: null };
    const { rerender } = render(<Grid {...gridProps(gridRef)} />);
    await waitFor(() => expect(mountedCells()).toBeGreaterThan(0));
    const first = gridRef.current?.core;

    rerender(<Grid {...gridProps(gridRef, { rowHeight: 40 })} />);
    await waitFor(() => {
      expect(gridRef.current?.core).not.toBe(first);
      expect(mountedCells()).toBeGreaterThan(0);
    });
    const core = gridRef.current?.core;
    if (!core) throw new Error("core is not mounted");

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 210, 48),
    );
    // Separate acts: the column fit bumps the layout revision the row fit reads.
    let columnFit: ColumnFitResult | undefined;
    await act(async () => {
      columnFit = core.columns.fit(["name"]);
    });
    let rowFit: RowFitResult | undefined;
    await act(async () => {
      rowFit = core.rowHeights.fit([2]);
    });

    expect(columnFit?.status).toBe("applied");
    expect(columnFit?.columns).toEqual([{ columnId: "name", width: 210, clamped: null }]);
    expect(rowFit?.status).toBe("applied");
    expect(rowFit?.rows).toEqual([{ rowId: 2, height: 48, clamped: null }]);
  });
});
