// packages/react/tests/row-groups.test.tsx

import { describe, it, expect, vi } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor, fireEvent } from "@testing-library/react";
import { createClientDataSource, createRowGrouping } from "@gp-grid/core";
import type {
  CellRendererParams,
  ColumnDefinition,
  GridCore,
  GroupLabelRendererParams,
  RowGrouping,
} from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";

interface Sale {
  id: number;
  region: string;
  city: string;
  amount: number;
  score: number;
}

const sales: Sale[] = [
  { id: 1, region: "IT", city: "Rome", amount: 10, score: 1 },
  { id: 2, region: "IT", city: "Milan", amount: 20, score: 3 },
  { id: 3, region: "FR", city: "Paris", amount: 5, score: 4 },
  { id: 4, region: "IT", city: "Rome", amount: 30, score: 5 },
];

const columns: ColumnDefinition[] = [
  { colId: "region", field: "region", cellDataType: "text", width: 120 },
  { colId: "city", field: "city", cellDataType: "text", width: 120 },
  { colId: "amount", field: "amount", cellDataType: "number", width: 100, editable: true },
  { colId: "score", field: "score", cellDataType: "number", width: 100 },
];

/** View rows while collapsed: the total row, then FR and IT. */
const grouping = (): RowGrouping =>
  createRowGrouping({
    dimensions: [{ field: "region" }, { field: "city" }],
    measures: [
      { field: "amount", aggregate: "sum" },
      { field: "score", aggregate: "avg" },
    ],
    grandTotal: "top",
  });

type GridHandle = MutableRefObject<GridRef<Sale> | null>;

const gridProps = (
  gridRef: GridHandle,
  overrides: Partial<GridProps<Sale>> = {},
): GridProps<Sale> => ({
  columns,
  dataSource: createClientDataSource(sales),
  rowHeight: 32,
  columnLayout: "fixed",
  getRowId: (row) => row.id,
  gridRef,
  ...overrides,
});

const require = <T,>(value: T | null | undefined, name: string): T => {
  if (value === null || value === undefined) throw new Error(`${name} is not mounted`);
  return value;
};

const cell = (row: number, col: number): HTMLElement =>
  require(
    document.querySelector<HTMLElement>(
      `.gp-grid-rows-wrapper [data-cell-row="${row}"][data-cell-col="${col}"]`,
    ),
    `cell ${row}:${col}`,
  );

const rowOf = (row: number): HTMLElement =>
  require(cell(row, 0).closest<HTMLElement>('[role="row"]'), `row ${row}`);

const root = (): HTMLElement =>
  require(document.querySelector<HTMLElement>(".gp-grid-container"), "root");

const toggleOf = (row: number, col = 0): HTMLElement =>
  require(cell(row, col).querySelector<HTMLElement>(".gp-grid-group-toggle"), "expander");

const mount = async (
  overrides: Partial<GridProps<Sale>> = {},
): Promise<{
  core: GridCore<Sale>;
  gridRef: GridHandle;
  rerender: (next: Partial<GridProps<Sale>>) => void;
}> => {
  const gridRef: GridHandle = { current: null };
  const view = render(<Grid {...gridProps(gridRef, overrides)} />);
  await waitFor(() => expect(document.querySelector(".gp-grid-cell")).not.toBeNull());
  const core = require(gridRef.current?.core, "core");
  const rerender = (next: Partial<GridProps<Sale>>): void =>
    view.rerender(<Grid {...gridProps(gridRef, { ...overrides, ...next })} />);
  return { core, gridRef, rerender };
};

const pointer = { button: 0, pointerId: 1, pointerType: "mouse" } as const;

describe("React row groups", () => {
  it("renders a flat grid as a grid with no level", async () => {
    await mount();
    expect(root().getAttribute("role")).toBe("grid");
    expect(rowOf(0).hasAttribute("aria-level")).toBe(false);
    expect(rowOf(0).hasAttribute("data-row-kind")).toBe(false);
    expect(document.querySelector(".gp-grid-cell--group-indent")).toBeNull();
  });

  it("renders a grouped grid as a treegrid with row kinds, levels and expansion", async () => {
    const { core } = await mount({ rowGrouping: grouping() });
    await waitFor(() => expect(root().getAttribute("role")).toBe("treegrid"));
    expect(core.rows.getCount()).toBe(3);

    const total = rowOf(0);
    expect(total.dataset.rowKind).toBe("total");
    expect(total.classList.contains("gp-grid-row--total")).toBe(true);
    expect(total.getAttribute("aria-level")).toBe("1");
    expect(total.hasAttribute("aria-expanded")).toBe(false);

    const group = rowOf(1);
    expect(group.dataset.rowKind).toBe("group");
    expect(group.classList.contains("gp-grid-row--group")).toBe(true);
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(group.style.getPropertyValue("--gp-grid-group-depth")).toBe("0");

    act(() => void core.rowGroups.setExpanded(null, true));
    await waitFor(() => expect(rowOf(1).getAttribute("aria-expanded")).toBe("true"));
    // FR > Paris > its leaf: the leaf sits at depth 2.
    const leaf = rowOf(3);
    expect(leaf.dataset.rowKind).toBe("record");
    expect(leaf.getAttribute("aria-level")).toBe("3");
    expect(cell(3, 0).classList.contains("gp-grid-cell--group-indent")).toBe(true);
    expect(cell(3, 1).classList.contains("gp-grid-cell--group-indent")).toBe(false);
  });

  it("places the label cell in the preferred column, else the first displayed one", async () => {
    const { rerender } = await mount({ rowGrouping: grouping(), groupLabelColumn: "city" });
    await waitFor(() => expect(cell(1, 1).classList.contains("gp-grid-cell--group-label")).toBe(true));
    expect(cell(1, 1).querySelector(".gp-grid-group-label")?.textContent).toBe("FR (1)");
    expect(cell(1, 0).classList.contains("gp-grid-cell--group-label")).toBe(false);
    expect(cell(0, 1).querySelector(".gp-grid-group-label")?.textContent).toBe("Grand total");

    rerender({ groupLabelColumn: "missing" });
    await waitFor(() => expect(cell(1, 0).classList.contains("gp-grid-cell--group-label")).toBe(true));
    expect(cell(1, 1).classList.contains("gp-grid-cell--group-label")).toBe(false);
  });

  it("renders aggregates as read-only cells whose renderer receives the row kind", async () => {
    const seen: CellRendererParams[] = [];
    const cellRenderer = (params: CellRendererParams): string => {
      seen.push(params);
      return String(params.value ?? "");
    };
    await mount({ rowGrouping: grouping(), cellRenderer });
    await waitFor(() => expect(cell(2, 2).textContent).toBe("60"));

    expect(cell(2, 2).getAttribute("aria-readonly")).toBe("true");
    expect(cell(0, 2).textContent).toBe("65");
    expect(cell(2, 3).textContent).toBe("3");
    const amountOnGroup = seen.filter((params) => params.rowIndex === 2 && params.colIndex === 2);
    expect(amountOnGroup.at(-1)?.rowKind).toBe("group");
    expect(seen.find((params) => params.rowIndex === 0)?.rowKind).toBe("total");
  });

  it("renders a no-aggregate cell of a group row empty, without its renderer", async () => {
    const cityRenderer = vi.fn((params: CellRendererParams) => `city ${String(params.value)}`);
    const amountRenderer = vi.fn((params: CellRendererParams) => `sum ${String(params.value)}`);
    const rendered = columns.map((column) => {
      if (column.field === "city") return { ...column, cellRenderer: cityRenderer };
      if (column.field === "amount") return { ...column, cellRenderer: amountRenderer };
      return column;
    });
    await mount({ columns: rendered, rowGrouping: grouping() });
    await waitFor(() => expect(cell(2, 2).textContent).toBe("sum 60"));

    expect(cell(2, 1).textContent).toBe("");
    expect(cell(2, 1).getAttribute("aria-readonly")).toBe("true");
    expect(cityRenderer).not.toHaveBeenCalled();
    expect(amountRenderer.mock.calls.at(-1)?.[0].rowKind).toBe("group");
  });

  it("toggles on a pointer down on the expander and selects nothing", async () => {
    const onRowGroupToggled = vi.fn();
    const { core } = await mount({ rowGrouping: grouping(), onRowGroupToggled });
    await waitFor(() => expect(core.rows.getCount()).toBe(3));
    const onCellPointerDown = vi.spyOn(core.input, "handleCellMouseDown");
    const onCellDoubleClick = vi.spyOn(core.input, "handleCellDoubleClick");

    act(() => void fireEvent.pointerDown(toggleOf(1), pointer));
    expect(core.rows.getCount()).toBe(4);
    expect(core.selection.getActiveCell()).toBeNull();
    expect(onRowGroupToggled).toHaveBeenCalledWith({ rowId: core.rows.getId(1), expanded: true });
    await waitFor(() => expect(toggleOf(1).classList.contains("gp-grid-group-toggle--expanded")).toBe(true));

    // A double-click on the expander toggles through its two pointer downs only.
    act(() => void fireEvent.doubleClick(toggleOf(1)));
    expect(core.rows.getCount()).toBe(4);
    expect(onCellPointerDown).not.toHaveBeenCalled();
    expect(onCellDoubleClick).not.toHaveBeenCalled();
  });

  it("toggles a group row with Enter and Space", async () => {
    const { core } = await mount({ rowGrouping: grouping() });
    await waitFor(() => expect(core.rows.getCount()).toBe(3));
    act(() => core.selection.setActiveCell(2, 2));

    act(() => void fireEvent.keyDown(root(), { key: "Enter" }));
    expect(core.rows.getCount()).toBe(5);
    await waitFor(() => expect(rowOf(2).getAttribute("aria-expanded")).toBe("true"));

    act(() => void fireEvent.keyDown(root(), { key: " " }));
    expect(core.rows.getCount()).toBe(3);
    expect(core.edit.getState()).toBeNull();
  });

  it("hands a groupLabelRenderer its params", async () => {
    const received: GroupLabelRendererParams[] = [];
    const groupLabelRenderer = (params: GroupLabelRendererParams): string => {
      received.push(params);
      return `custom ${params.label}`;
    };
    const { core } = await mount({ rowGrouping: grouping(), groupLabelRenderer });
    await waitFor(() => expect(cell(1, 0).textContent).toBe("custom FR (1)"));

    const fr = received.filter((params) => params.viewIndex === 1).at(-1);
    expect(fr?.row).toMatchObject({ kind: "group", field: "region", value: "FR", leafCount: 1 });
    expect(fr?.label).toBe("FR (1)");
    act(() => fr?.toggle());
    expect(core.rows.getCount()).toBe(4);

    const total = received.filter((params) => params.viewIndex === 0).at(-1);
    expect(total?.row.kind).toBe("total");
    act(() => total?.toggle());
    expect(core.rows.getCount()).toBe(4);
  });

  it("regroups on a new rowGrouping without a new core", async () => {
    const { core, gridRef, rerender } = await mount({ rowGrouping: grouping() });
    await waitFor(() => expect(core.rows.getCount()).toBe(3));

    rerender({
      rowGrouping: createRowGrouping({ dimensions: [{ field: "city" }] }),
    });
    await waitFor(() => expect(core.rows.getCount()).toBe(3));
    expect(core.rows.getViewRow(0)).toMatchObject({ kind: "group", value: "Milan" });

    rerender({ rowGrouping: null });
    await waitFor(() => expect(root().getAttribute("role")).toBe("grid"));
    expect(core.rows.getCount()).toBe(4);
    expect(gridRef.current?.core).toBe(core);
  });
});
