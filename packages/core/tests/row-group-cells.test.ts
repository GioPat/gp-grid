// PRD 009 D6: the markup a group row whose children failed to load adds.

import { describe, expect, it, vi } from "vitest";
import {
  groupCellOf,
  groupLabelParams,
  groupToggleClassName,
  hierarchyRowAttributes,
  type GroupCellInput,
} from "../src/row-group-cells";
import { resolveGridLabels } from "../src/i18n";
import type { ColumnDefinition, HierarchyGroupRow } from "../src/types";

const columns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 100 },
  { field: "amount", cellDataType: "number", width: 100 },
];

const group: HierarchyGroupRow = {
  kind: "group", id: "g:IT", depth: 0, expanded: false,
  childCount: 2, leafCount: 3, field: "country", value: "IT",
};
const failed: HierarchyGroupRow = { ...group, error: "timeout" };

const input = (labels = resolveGridLabels()): GroupCellInput => ({ labelColumnId: "country", columns, labels });

describe("hierarchyRowAttributes — load error", () => {
  it("adds the error class and attribute to a failed group row", () => {
    expect(hierarchyRowAttributes(failed)).toEqual({
      className: "gp-grid-row--group gp-grid-row--error",
      "data-row-kind": "group",
      "data-row-error": true,
      "aria-level": 1,
      "aria-expanded": false,
    });
  });

  it("adds neither to a group row without an error", () => {
    const attributes = hierarchyRowAttributes(group);
    expect(attributes.className).toBe("gp-grid-row--group");
    expect(attributes).not.toHaveProperty("data-row-error");
  });
});

describe("groupCellOf — load error", () => {
  it("titles the label cell of a failed group with the loadFailed label", () => {
    expect(groupCellOf(failed, "country", input()).title).toBe("Loading failed. Expand again to retry.");
    const labels = resolveGridLabels({ rowGroups: { loadFailed: "Caricamento fallito" } });
    expect(groupCellOf(failed, "country", input(labels)).title).toBe("Caricamento fallito");
  });

  it("titles neither another cell of the row nor a group without an error", () => {
    expect(groupCellOf(failed, "amount", input()).title).toBeUndefined();
    expect(groupCellOf(group, "country", input())).not.toHaveProperty("title");
  });
});

const total = { kind: "total", id: "gp-total", depth: 0, leafCount: 5 } as const;
const record = { kind: "record", id: "r1", depth: 1 } as const;
const FLAT = { indent: false, labelRow: null, label: "", readOnly: false, className: "" };

describe("hierarchyRowAttributes — flat and total rows", () => {
  it("gives a flat row an empty class and no attribute", () => {
    expect(hierarchyRowAttributes(undefined)).toEqual({ className: "" });
  });

  it("marks a total row without aria-expanded", () => {
    expect(hierarchyRowAttributes(total)).toEqual({
      className: "gp-grid-row--total",
      "data-row-kind": "total",
      "aria-level": 1,
      "aria-expanded": undefined,
    });
  });
});

describe("groupCellOf — flat, record and total rows", () => {
  it("is the flat cell without a row or without a hierarchy context", () => {
    expect(groupCellOf(undefined, "country", input())).toEqual(FLAT);
    expect(groupCellOf(group, "country", null)).toEqual(FLAT);
  });

  it("indents only the label column of a record row", () => {
    expect(groupCellOf(record, "country", input())).toEqual({
      ...FLAT, indent: true, className: "gp-grid-cell--group-indent",
    });
    expect(groupCellOf(record, "amount", input())).toEqual(FLAT);
  });

  it("labels the total row and makes its other cells read-only", () => {
    expect(groupCellOf(total, "country", input())).toMatchObject({
      indent: true, labelRow: total, label: "Grand total", readOnly: true,
    });
    expect(groupCellOf(total, "amount", input())).toEqual({ ...FLAT, readOnly: true });
  });
});

describe("groupToggleClassName and groupLabelParams", () => {
  it("names the expander by state and gives the total row the empty one", () => {
    expect(groupToggleClassName(total)).toBe("gp-grid-group-toggle gp-grid-group-toggle--none");
    expect(groupToggleClassName(group)).toBe("gp-grid-group-toggle");
    expect(groupToggleClassName({ ...group, expanded: true })).toBe("gp-grid-group-toggle gp-grid-group-toggle--expanded");
  });

  it("builds the renderer params with a toggle that flips a group and not the total row", () => {
    const onToggle = vi.fn();
    const params = groupLabelParams(group, 4, "IT (3)", onToggle);
    expect(params).toMatchObject({ row: group, viewIndex: 4, label: "IT (3)" });
    params.toggle();
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(4);

    groupLabelParams(total, 0, "Grand total", onToggle).toggle();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("childless group rows (PRD 012 D1)", () => {
  const childless: HierarchyGroupRow = { ...group, id: "g:XX", childCount: 0, leafCount: 4 };

  it("gives a childless group the empty expander and no aria-expanded", () => {
    expect(groupToggleClassName(childless)).toBe("gp-grid-group-toggle gp-grid-group-toggle--none");
    expect(groupToggleClassName({ ...childless, expanded: true })).toBe("gp-grid-group-toggle gp-grid-group-toggle--none");
    expect(hierarchyRowAttributes(childless)).toEqual({
      className: "gp-grid-row--group",
      "data-row-kind": "group",
      "aria-level": 1,
      "aria-expanded": undefined,
    });
  });

  it("makes the label toggle a no-op on a childless group", () => {
    const onToggle = vi.fn();
    groupLabelParams(childless, 3, "XX", onToggle).toggle();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
