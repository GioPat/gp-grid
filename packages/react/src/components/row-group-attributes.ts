// packages/react/src/components/row-group-attributes.ts
// What a row and a cell of a hierarchy add to their markup (PRD 008 D10).

import type React from "react";
import type {
  ColumnDefinition,
  GridLabels,
  HierarchyGroupRow,
  HierarchyRow,
  HierarchyTotalRow,
} from "@gp-grid/core";
import type { ReactGroupLabelRenderer } from "../types";

/** Shared by every cell while a hierarchy is bound; `null` while flat. */
export interface RowGroupCellContext {
  labelColumnId: string | undefined;
  labels: GridLabels;
  columns: readonly ColumnDefinition[];
  renderer?: ReactGroupLabelRenderer;
  onTogglePointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
}

export interface RowGroupRowAttributes {
  className: string;
  "data-row-kind"?: HierarchyRow["kind"];
  "aria-level"?: number;
  "aria-expanded"?: boolean;
}

const ROW_KIND_CLASS: Record<HierarchyRow["kind"], string> = {
  record: "",
  group: "gp-grid-row--group",
  total: "gp-grid-row--total",
};

export const rowGroupAttributes = (row: HierarchyRow | undefined): RowGroupRowAttributes => {
  if (row === undefined) return { className: "" };
  return {
    className: ROW_KIND_CLASS[row.kind],
    "data-row-kind": row.kind,
    "aria-level": row.depth + 1,
    "aria-expanded": row.kind === "group" ? row.expanded : undefined,
  };
};

/** The custom property the label column's indent reads. */
export const groupDepthStyle = (row: HierarchyRow | undefined): React.CSSProperties =>
  row === undefined ? {} : ({ "--gp-grid-group-depth": row.depth } as React.CSSProperties);

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
