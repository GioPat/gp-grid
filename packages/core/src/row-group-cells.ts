// packages/core/src/row-group-cells.ts
// What a row and a cell of a hierarchy add to their markup; the wrappers only bind it.

import type {
  ColumnDefinition,
  GroupLabelRendererParams,
  HierarchyGroupRow,
  HierarchyRow,
  HierarchyRowKind,
  HierarchyTotalRow,
} from "./types";
import type { GridLabels } from "./i18n";
import { formatGroupLabel } from "./row-group-layout";

export interface HierarchyRowAttributes {
  className: string;
  "data-row-kind"?: HierarchyRowKind;
  "aria-level"?: number;
  "aria-expanded"?: boolean;
}

const ROW_KIND_CLASS: Record<HierarchyRowKind, string> = {
  record: "",
  group: "gp-grid-row--group",
  total: "gp-grid-row--total",
};

const FLAT_ROW: HierarchyRowAttributes = { className: "" };

export const hierarchyRowAttributes = (row: HierarchyRow | undefined): HierarchyRowAttributes => {
  if (row === undefined) return FLAT_ROW;
  return {
    className: ROW_KIND_CLASS[row.kind],
    "data-row-kind": row.kind,
    "aria-level": row.depth + 1,
    "aria-expanded": row.kind === "group" ? row.expanded : undefined,
  };
};

/** The custom property the label column's indent reads. */
export const GROUP_DEPTH_PROPERTY = "--gp-grid-group-depth";

export interface GroupCell {
  /** The label column's cell on any row of a hierarchy. */
  indent: boolean;
  /** Set when the cell is the label cell of a group or total row. */
  labelRow: HierarchyGroupRow | HierarchyTotalRow | null;
  /** The formatted label of `labelRow`. */
  label: string;
  readOnly: boolean;
  className: string;
}

const FLAT_CELL: GroupCell = { indent: false, labelRow: null, label: "", readOnly: false, className: "" };
const INDENT_CELL: GroupCell = { ...FLAT_CELL, indent: true, className: "gp-grid-cell--group-indent" };
const READ_ONLY_CELL: GroupCell = { ...FLAT_CELL, readOnly: true };

export interface GroupCellInput {
  labelColumnId: string | undefined;
  columns: readonly ColumnDefinition[];
  labels: GridLabels;
}

/** What one cell of a hierarchy is: the indented label column, a label cell, or a plain read-only cell. */
export const groupCellOf = (
  row: HierarchyRow | undefined,
  columnId: string,
  input: GroupCellInput | null,
): GroupCell => {
  if (row === undefined || input === null) return FLAT_CELL;
  const indent = columnId === input.labelColumnId;
  if (row.kind === "record") return indent ? INDENT_CELL : FLAT_CELL;
  if (indent === false) return READ_ONLY_CELL;
  return {
    indent,
    labelRow: row,
    label: formatGroupLabel(row, input.columns, input.labels),
    readOnly: true,
    className: "gp-grid-cell--group-indent gp-grid-cell--group-label",
  };
};

export const groupToggleClassName = (row: HierarchyGroupRow | HierarchyTotalRow): string => {
  if (row.kind === "total") return "gp-grid-group-toggle gp-grid-group-toggle--none";
  return row.expanded ? "gp-grid-group-toggle gp-grid-group-toggle--expanded" : "gp-grid-group-toggle";
};

/** Renderer params of a label cell; `toggle` is a no-op on the total row. */
export const groupLabelParams = (
  row: HierarchyGroupRow | HierarchyTotalRow,
  viewIndex: number,
  label: string,
  onToggle: (viewIndex: number) => void,
): GroupLabelRendererParams => ({
  row,
  viewIndex,
  label,
  toggle: () => {
    if (row.kind === "group") onToggle(viewIndex);
  },
});
