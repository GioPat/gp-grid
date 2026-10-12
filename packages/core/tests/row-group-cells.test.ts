// PRD 009 D6: the markup a group row whose children failed to load adds.

import { describe, expect, it } from "vitest";
import { groupCellOf, hierarchyRowAttributes, type GroupCellInput } from "../src/row-group-cells";
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
