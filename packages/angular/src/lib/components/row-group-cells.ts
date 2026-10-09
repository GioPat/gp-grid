// What a row and a cell of a hierarchy add to their markup (PRD 008 D10).

import { formatGroupLabel } from '@gp-grid/core';
import type {
  ColumnDefinition,
  GridLabels,
  GroupLabelRendererParams,
  HierarchyGroupRow,
  HierarchyRow,
  HierarchyTotalRow,
} from '@gp-grid/core';
import type { GroupLabelRendererTemplate } from '../types';

/** Shared by every cell while a hierarchy is bound; `null` while flat. */
export interface RowGroupCellContext {
  labelColumnId: string | undefined;
  labels: GridLabels;
  columns: readonly ColumnDefinition[];
  renderer: GroupLabelRendererTemplate | null;
  onTogglePointerDown: (rowIndex: number, event: PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
}

export interface GroupCell {
  /** The label column's cell on any row of a hierarchy. */
  indent: boolean;
  /** Set when the cell is the label cell of a group or total row. */
  labelRow: HierarchyGroupRow | HierarchyTotalRow | null;
  /** The formatted label of `labelRow`. */
  label: string | null;
  readOnly: boolean;
}

const FLAT_CELL: GroupCell = { indent: false, labelRow: null, label: null, readOnly: false };

const ROW_KIND_CLASS: Record<HierarchyRow['kind'], string> = {
  record: '',
  group: 'gp-grid-row--group',
  total: 'gp-grid-row--total',
};

export const rowKindClassName = (row: HierarchyRow | undefined): string =>
  row === undefined ? '' : ROW_KIND_CLASS[row.kind];

export const rowAriaLevel = (row: HierarchyRow | undefined): number | null =>
  row === undefined ? null : row.depth + 1;

export const rowAriaExpanded = (row: HierarchyRow | undefined): boolean | null =>
  row?.kind === 'group' ? row.expanded : null;

export const groupCellOf = (
  row: HierarchyRow | undefined,
  columnId: string,
  context: RowGroupCellContext | null,
): GroupCell => {
  if (row === undefined || context === null) return FLAT_CELL;
  const indent = columnId === context.labelColumnId;
  if (row.kind === 'record') return { indent, labelRow: null, label: null, readOnly: false };
  if (indent === false) return { indent, labelRow: null, label: null, readOnly: true };
  const label = formatGroupLabel(row, context.columns, context.labels);
  return { indent, labelRow: row, label, readOnly: true };
};

export const groupCellClassName = (cell: GroupCell): string => {
  if (cell.labelRow !== null) return 'gp-grid-cell--group-indent gp-grid-cell--group-label';
  return cell.indent ? 'gp-grid-cell--group-indent' : '';
};

/** Renderer params of a label cell; `toggle` is a no-op on the total row. */
export const groupLabelParams = (
  row: HierarchyGroupRow | HierarchyTotalRow,
  rowIndex: number,
  label: string,
  context: RowGroupCellContext,
): GroupLabelRendererParams => ({
  row,
  viewIndex: rowIndex,
  label,
  toggle: () => {
    if (row.kind === 'group') context.onToggle(rowIndex);
  },
});
