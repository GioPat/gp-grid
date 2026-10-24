// packages/react/tests/row-groups-loading.test.tsx
// PRD 009 D6: a placeholder renders as the loading row in the suffix, and a group whose
// children failed to load carries the error markup, in the pin layer too.

import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { defaultGridLabels } from "@gp-grid/core";
import type { ColumnDefinition, DataSource, HierarchicalRowAccess, HierarchyRow } from "@gp-grid/core";
import { Grid } from "../src/Grid";

const OPEN_ID = "g:south";
const PLACEHOLDERS = 4;

const columns: ColumnDefinition[] = [
  { colId: "region", field: "region", cellDataType: "text", width: 120, pinned: "start" },
  { colId: "amount", field: "amount", cellDataType: "number", width: 100 },
];

/** A failed group, an expanded group, then its children, none of them loaded yet. */
const rows: readonly (HierarchyRow | undefined)[] = [
  { kind: "group", id: "g:north", depth: 0, expanded: false, childCount: 3, leafCount: 3, field: "region", value: "north", error: "timeout" },
  { kind: "group", id: OPEN_ID, depth: 0, expanded: true, childCount: PLACEHOLDERS, leafCount: PLACEHOLDERS, field: "region", value: "south" },
  ...Array.from({ length: PLACEHOLDERS }, () => undefined),
];

const idOf = (viewRow: number) => rows[viewRow]?.id ?? `gp-pending:${viewRow - 2}@${OPEN_ID}`;

const access: HierarchicalRowAccess = {
  hierarchical: true,
  rowCount: rows.length,
  getRowId: idOf,
  getRow: (viewRow) => rows[viewRow],
  getValue: (viewRow, field) => (field === "amount" && rows[viewRow] !== undefined ? 10 : null),
  locate: (id) => rows.findIndex((_, viewRow) => idOf(viewRow) === id),
};

const source: DataSource<never> = {
  loadMode: "all",
  query: async () => ({ rows: [], totalRows: rows.length, access }),
};

const require = <T,>(value: T | null | undefined, name: string): T => {
  if (value === null || value === undefined) throw new Error(`${name} is not mounted`);
  return value;
};

const labelCell = (scope: string, row: number): HTMLElement =>
  require(document.querySelector<HTMLElement>(`${scope} [data-cell-row="${row}"][data-cell-col="0"]`), `label ${row}`);

const mount = async (frozen: number): Promise<void> => {
  render(<Grid columns={columns} dataSource={source} rowHeight={32} columnLayout="fixed" freezeRows={{ count: frozen }} />);
  await waitFor(() => expect(document.querySelectorAll(".gp-grid-row--loading")).toHaveLength(PLACEHOLDERS));
};

describe("React row groups — placeholders and failed groups", () => {
  it("renders a suffix placeholder as a loading row with no cells", async () => {
    await mount(0);
    const loading = Array.from(document.querySelectorAll<HTMLElement>(".gp-grid-rows-wrapper .gp-grid-row--loading"));
    expect(loading.map((row) => row.getAttribute("aria-rowindex")).sort()).toEqual(["4", "5", "6", "7"]);
    for (const row of loading) {
      expect(row.querySelector(".gp-grid-cell")).toBeNull();
      expect(row.hasAttribute("data-row-kind")).toBe(false);
    }
  });

  it("marks a failed group with the error class, attribute and loadFailed title", async () => {
    await mount(0);
    const failed = require(labelCell(".gp-grid-rows-wrapper", 0).closest<HTMLElement>('[role="row"]'), "row 0");
    expect(failed.classList.contains("gp-grid-row--error")).toBe(true);
    expect(failed.getAttribute("data-row-error")).toBe("true");
    expect(labelCell(".gp-grid-rows-wrapper", 0).getAttribute("title")).toBe(defaultGridLabels.rowGroups.loadFailed);

    const open = require(labelCell(".gp-grid-rows-wrapper", 1).closest<HTMLElement>('[role="row"]'), "row 1");
    expect(open.classList.contains("gp-grid-row--error")).toBe(false);
    expect(open.hasAttribute("data-row-error")).toBe(false);
    expect(labelCell(".gp-grid-rows-wrapper", 1).getAttribute("title")).toBe("south (4)");
  });

  it("binds data-row-error on the frozen pin layer's row", async () => {
    await mount(2);
    const pinRowOf = (row: number) =>
      require(labelCell(".gp-grid-frozen-pins", row).closest<HTMLElement>(".gp-grid-frozen-pin-row"), `pin row ${row}`);
    expect(pinRowOf(0).getAttribute("data-row-error")).toBe("true");
    expect(pinRowOf(0).dataset.rowKind).toBe("group");
    expect(pinRowOf(1).hasAttribute("data-row-error")).toBe(false);
    expect(labelCell(".gp-grid-frozen-pins", 0).getAttribute("title")).toBe(defaultGridLabels.rowGroups.loadFailed);
    expect(document.querySelectorAll(".gp-grid-frozen-pins .gp-grid-frozen-pin-row")).toHaveLength(2);
  });
});
