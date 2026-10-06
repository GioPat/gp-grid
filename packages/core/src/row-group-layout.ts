// packages/core/src/row-group-layout.ts
// The label column and the label text of group and total rows (PRD 008 D10).

import type { ColumnDefinition, HierarchyGroupRow, HierarchyTotalRow } from "./types";
import type { ColumnLayoutSnapshot } from "./types/geometry";
import { formatLabel, type GridLabels } from "./i18n";
import { formatCellValue } from "./utils";

/** The preferred column when it is displayed, else the first displayed one. */
export const resolveGroupLabelColumnId = (
  layout: Pick<ColumnLayoutSnapshot, "columns">,
  preferred?: string,
): string | undefined => {
  const match = layout.columns.find((column) => column.columnId === preferred);
  return match?.columnId ?? layout.columns[0]?.columnId;
};

const formatGroupValue = (
  row: HierarchyGroupRow,
  columns: readonly ColumnDefinition[],
  labels: GridLabels,
): string => {
  if (row.value == null) return labels.blanks;
  const formatter = columns.find((column) => column.field === row.field)?.valueFormatter;
  return formatCellValue(row.value, formatter);
};

/** The key through its dimension column's formatter, placed in `labels.rowGroups`. */
export const formatGroupLabel = (
  row: HierarchyGroupRow | HierarchyTotalRow,
  columns: readonly ColumnDefinition[],
  labels: GridLabels,
): string => {
  const count = row.leafCount;
  if (row.kind === "total") return formatLabel(labels.rowGroups.grandTotal, { count });
  const value = formatGroupValue(row, columns, labels);
  return formatLabel(labels.rowGroups.label, { value, count });
};
