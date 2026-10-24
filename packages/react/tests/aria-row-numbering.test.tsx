// packages/react/tests/aria-row-numbering.test.tsx
// PRD 007 D9 row numbering: the header's rows come first in every mode, then
// the body rows, frozen ones included, and the row count covers both.

import { describe, it, expect } from "vitest";
import type { MutableRefObject } from "react";
import { render, act, waitFor } from "@testing-library/react";
import { createClientDataSource } from "@gp-grid/core";
import type { ColumnDefinition, ColumnGroupChild } from "@gp-grid/core";
import { Grid } from "../src/Grid";
import type { GridRef } from "../src/types";

type Row = Record<string, string>;

const ROW_COUNT = 40;
const columns: ColumnDefinition[] = ["a", "b", "c"].map((id) => ({ field: id, cellDataType: "text", width: 100 }));
const rows: Row[] = Array.from({ length: ROW_COUNT }, (_, i) => ({ a: `a${i}`, b: `b${i}`, c: `c${i}` }));
const dataSource = createClientDataSource(rows);
/** Three bands: `a` sits two groups deep, `c` is ungrouped. */
const columnGroups: ColumnGroupChild[] = [
  { groupId: "Outer", children: [{ groupId: "Inner", children: ["a"] }, "b"] },
  "c",
];

const renderGrid = async (groups?: readonly ColumnGroupChild[]) => {
  const gridRef: MutableRefObject<GridRef<Row> | null> = { current: null };
  render(
    <Grid
      columns={columns}
      columnGroups={groups}
      dataSource={dataSource}
      rowHeight={32}
      columnLayout="fixed"
      freezeRows={{ count: 2 }}
      gridRef={gridRef}
    />,
  );
  await waitFor(() => expect(document.querySelectorAll(".gp-grid-frozen-rows .gp-grid-cell").length).toBeGreaterThan(0));
  return gridRef;
};

const ariaRows = (selector: string): number[] =>
  Array.from(document.querySelectorAll(selector)).map((row) => Number(row.getAttribute("aria-rowindex")));

const rowCount = (): number => Number(document.querySelector('[role="grid"]')?.getAttribute("aria-rowcount"));

describe("Grid ARIA row numbering", () => {
  it("numbers the flat header row first and the body rows after it", async () => {
    await renderGrid();
    expect(ariaRows('.gp-grid-header[role="row"]')).toEqual([1]);
    expect(ariaRows(".gp-grid-frozen-rows .gp-grid-row")).toEqual([2, 3]);
    expect(ariaRows('.gp-grid-body-scroll > div > .gp-grid-rows-wrapper > [role="row"]').slice(0, 2)).toEqual([4, 5]);
    expect(document.querySelectorAll('.gp-grid-frozen-pins [role="row"]')).toHaveLength(0);
    expect(rowCount()).toBe(ROW_COUNT + 1);
  });

  it("numbers the bands first in a grouped grid and follows a band count change", async () => {
    const gridRef = await renderGrid(columnGroups);
    expect(document.querySelector(".gp-grid-header")?.hasAttribute("aria-rowindex")).toBe(false);
    expect(ariaRows('.gp-grid-header > [role="row"]')).toEqual([1, 2, 3]);
    expect(ariaRows(".gp-grid-frozen-rows .gp-grid-row")).toEqual([4, 5]);
    expect(ariaRows('.gp-grid-body-scroll > div > .gp-grid-rows-wrapper > [role="row"]').slice(0, 2)).toEqual([6, 7]);
    expect(rowCount()).toBe(ROW_COUNT + 3);

    await act(async () => {
      gridRef.current?.core?.columns.setGroups(null);
    });
    expect(ariaRows('.gp-grid-header[role="row"]')).toEqual([1]);
    expect(ariaRows(".gp-grid-frozen-rows .gp-grid-row")).toEqual([2, 3]);
    expect(rowCount()).toBe(ROW_COUNT + 1);
  });
});
