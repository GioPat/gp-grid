// packages/vue/src/components/row-group-attributes.ts
// What a row and a cell of a hierarchy add to their markup (PRD 008 D10).

import type {
  ColumnDefinition,
  GridLabels,
  HierarchyGroupRow,
  HierarchyRow,
  HierarchyTotalRow,
} from "@gp-grid/core";
import type { VueGroupLabelRenderer } from "../types";

/** Shared by every cell while a hierarchy is bound; `null` while flat. */
export interface RowGroupCellContext {
  labelColumnId: string | undefined;
  labels: GridLabels;
  columns: readonly ColumnDefinition[];
  renderer?: VueGroupLabelRenderer;
  onTogglePointerDown: (rowIndex: number, e: PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
}

export interface RowGroupRowAttributes {
  "data-row-kind"?: HierarchyRow["kind"];
  "aria-level"?: number;
  "aria-expanded"?: "true" | "false";
}

const ROW_KIND_CLASS: Record<HierarchyRow["kind"], string> = {
  record: "",
  group: "gp-grid-row--group",
  total: "gp-grid-row--total",
};

export const rowKindClass = (row: HierarchyRow | undefined): string =>
  row === undefined ? "" : ROW_KIND_CLASS[row.kind];

const expandedOf = (row: HierarchyRow): RowGroupRowAttributes["aria-expanded"] => {
  if (row.kind !== "group") return undefined;
  return row.expanded ? "true" : "false";
};

export const rowGroupAttributes = (row: HierarchyRow | undefined): RowGroupRowAttributes => {
  if (row === undefined) return {};
  return {
    "data-row-kind": row.kind,
    "aria-level": row.depth + 1,
    "aria-expanded": expandedOf(row),
  };
};

/** The custom property the label column's indent reads, as a style string fragment. */
export const groupDepthStyle = (row: HierarchyRow | undefined): string =>
  row === undefined ? "" : ` --gp-grid-group-depth: ${row.depth};`;

export interface GroupCell {
  /** The label column's cell on any row of a hierarchy. */
  indent: boolean;
  /** Set when the cell is the label cell of a group or total row. */
  labelRow: HierarchyGroupRow | HierarchyTotalRow | null;
  readOnly: boolean;
}

const FLAT_CELL: GroupCell = { indent: false, labelRow: null, readOnly: false };

export const groupCellOf = (
  row: HierarchyRow | undefined,
  columnId: string,
  context: RowGroupCellContext | null,
): GroupCell => {
  if (row === undefined || context === null) return FLAT_CELL;
  const indent = columnId === context.labelColumnId;
  if (row.kind === "record") return { indent, labelRow: null, readOnly: false };
  return { indent, labelRow: indent ? row : null, readOnly: true };
};

export const groupCellClassName = (cell: GroupCell): string => {
  if (cell.labelRow !== null) return "gp-grid-cell--group-indent gp-grid-cell--group-label";
  return cell.indent ? "gp-grid-cell--group-indent" : "";
};
