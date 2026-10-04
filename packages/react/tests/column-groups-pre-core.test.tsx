// packages/react/tests/column-groups-pre-core.test.tsx
// PRD 007 D9/D10 in React: before the core exists (the server render and the
// first client frame) a fragment resolves its group from the `columnGroups`
// prop, so its label, wrap class and renderer match what the core renders.

import { describe, it, expect, afterEach, vi } from "vitest";
import type { MutableRefObject } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { render, waitFor } from "@testing-library/react";
import { createClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition, ColumnGroupChild, ColumnGroupHeaderParams } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridProps, GridRef } from "../src/types";

type Row = Record<string, string>;

const column = (id: string): ColumnDefinition => ({ colId: id, field: id, cellDataType: "text", width: 100 });

/** `Region{ North{ Q1{a, b}, c }, d }`, `Totals{ e, f }` and the ungrouped `x`. */
const columnGroups: ColumnGroupChild[] = [
  {
    groupId: "region",
    headerName: "Region name",
    children: [
      {
        groupId: "north",
        headerName: "North name",
        wrapHeaderText: true,
        children: [{ groupId: "q1", headerName: "Q1 name", children: ["a", "b"] }, "c"],
      },
      "d",
    ],
  },
  { groupId: "totals", headerName: "Totals name", headerRenderer: "totals", children: ["e", "f"] },
  "x",
];

const renderTotals = (params: ColumnGroupHeaderParams) => (
  <span className="totals-renderer">{`${params.group.headerName}: ${params.columnIds.join("+")}`}</span>
);

const rows: Row[] = Array.from({ length: 20 }, (_, i) => ({ a: `a${i}`, x: `x${i}` }));

const gridProps = (overrides: Partial<GridProps<Row>> = {}): GridProps<Row> => ({
  columns: ["a", "b", "c", "d", "e", "f", "x"].map(column),
  dataSource: createClientDataSource(rows),
  rowHeight: 32,
  headerHeight: 30,
  columnLayout: "fixed",
  columnGroups,
  headerRenderers: { totals: renderTotals },
  ...overrides,
});

const fragment = (root: ParentNode, groupId: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(`.gp-grid-header-group[data-group-id="${groupId}"]`);
  if (element === null) throw new Error(`${groupId} has no fragment`);
  return element;
};

/** Label, wrap class and renderer output of every group, as rendered. */
const groupHeaders = (root: ParentNode) =>
  ["region", "north", "q1", "totals"].map((groupId) => {
    const element = fragment(root, groupId);
    return [groupId, element.textContent, element.classList.contains("gp-grid-header-cell--wrap")];
  });

const EXPECTED_HEADERS = [
  ["region", "Region name", false],
  ["north", "North name", true],
  ["q1", "Q1 name", false],
  ["totals", "Totals name: e+f", false],
];

describe("Grid column groups before the core exists", () => {
  let root: Root | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("server-renders each group's headerName, wrap class and renderer", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Grid {...gridProps()} />);

    expect(groupHeaders(container)).toEqual(EXPECTED_HEADERS);
    expect(fragment(container, "totals").querySelector(".totals-renderer")).not.toBeNull();
  });

  it("hydrates the server header unchanged and keeps it once the core exists", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Grid {...gridProps()} />);
    document.body.appendChild(container);
    expect(groupHeaders(container)).toEqual(EXPECTED_HEADERS);
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, "error");
    const gridRef: MutableRefObject<GridRef<Row> | null> = { current: null };

    await act(async () => {
      root = hydrateRoot(container, <Grid {...gridProps({ gridRef })} />, {
        onRecoverableError: recoverable,
      });
    });
    await waitFor(() => expect(gridRef.current?.core).toBeTruthy());

    expect(recoverable).not.toHaveBeenCalled();
    const hydrationWarnings = consoleError.mock.calls.filter((call) => /hydrat/i.test(String(call[0])));
    expect(hydrationWarnings).toEqual([]);
    expect(groupHeaders(container)).toEqual(EXPECTED_HEADERS);
  });

  it("reads the group from the core once it exists", async () => {
    const gridRef: MutableRefObject<GridRef<Row> | null> = { current: null };
    const view = render(<Grid {...gridProps({ gridRef })} />);
    await waitFor(() => expect(gridRef.current?.core).toBeTruthy());

    const renamed = structuredClone(columnGroups) as [{ headerName: string }, ...ColumnGroupChild[]];
    renamed[0].headerName = "Region from the core";
    act(() => {
      gridRef.current?.core?.columns.setGroups(renamed as ColumnGroupChild[]);
    });

    expect(fragment(view.container, "region").textContent).toBe("Region from the core");
  });
});
