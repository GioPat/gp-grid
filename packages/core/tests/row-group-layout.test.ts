// PRD 008 D10: the group label column and the label text.

import { describe, expect, it } from "vitest";
import { formatGroupLabel, isEmptyGroupCell, resolveGroupLabelColumnId } from "../src/row-group-layout";
import { resolveGridLabels } from "../src/i18n";
import type { CellValue, ColumnDefinition, HierarchyGroupRow } from "../src/types";

const layout = { columns: [{ columnId: "country" }, { columnId: "city" }] } as unknown as Parameters<
  typeof resolveGroupLabelColumnId
>[0];

const columns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 100, valueFormatter: (v) => `<${String(v)}>` },
  { field: "city", cellDataType: "text", width: 100 },
];

const group = (field: string, value: CellValue): HierarchyGroupRow => ({
  kind: "group", id: `g:${String(value)}`, depth: 0, expanded: false,
  childCount: 2, leafCount: 3, field, value,
});

describe("resolveGroupLabelColumnId", () => {
  it("keeps a displayed preferred column", () => {
    expect(resolveGroupLabelColumnId(layout, "city")).toBe("city");
  });

  it("falls back to the first displayed column for a hidden, missing or absent preference", () => {
    expect(resolveGroupLabelColumnId(layout, "amount")).toBe("country");
    expect(resolveGroupLabelColumnId(layout)).toBe("country");
  });

  it("answers undefined with no displayed column", () => {
    expect(resolveGroupLabelColumnId({ columns: [] })).toBeUndefined();
  });
});

describe("formatGroupLabel", () => {
  const labels = resolveGridLabels();

  it("formats the key through its dimension column", () => {
    expect(formatGroupLabel(group("country", "IT"), columns, labels)).toBe("<IT> (3)");
    expect(formatGroupLabel(group("city", "Rome"), columns, labels)).toBe("Rome (3)");
  });

  it("labels the null bucket from labels.blanks", () => {
    expect(formatGroupLabel(group("country", null), columns, labels)).toBe("(Blanks) (3)");
    const custom = resolveGridLabels({ blanks: "(vuoto)", rowGroups: { label: "{value}: {count}" } });
    expect(formatGroupLabel(group("city", null), columns, custom)).toBe("(vuoto): 3");
  });

  it("keeps an empty string apart from the null bucket", () => {
    expect(formatGroupLabel(group("city", ""), columns, labels)).toBe(" (3)");
  });

  it("prints the grand total label on the total row", () => {
    const total = { kind: "total", id: "gp-total", depth: 0, leafCount: 9 } as const;
    expect(formatGroupLabel(total, columns, labels)).toBe("Grand total");
    const custom = resolveGridLabels({ rowGroups: { grandTotal: "Totale ({count})" } });
    expect(formatGroupLabel(total, columns, custom)).toBe("Totale (9)");
  });
});

describe("isEmptyGroupCell", () => {
  it("is empty on a group or total row without an aggregate", () => {
    expect(isEmptyGroupCell("group", null)).toBe(true);
    expect(isEmptyGroupCell("total", undefined)).toBe(true);
  });

  it("keeps aggregates, record rows and flat grids", () => {
    expect(isEmptyGroupCell("group", 0)).toBe(false);
    expect(isEmptyGroupCell("total", "")).toBe(false);
    expect(isEmptyGroupCell("record", null)).toBe(false);
    expect(isEmptyGroupCell(undefined, null)).toBe(false);
  });
});
