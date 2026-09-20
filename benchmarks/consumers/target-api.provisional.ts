// Provisional target vocabulary used to check examples in the PRD 001 API
// review. These declarations are intentionally local until their owning PRDs
// implement and export the contracts. PRD 002 promoted ColumnId, ViewRow,
// getViewRow, getRecordById, setColumnState and resetColumnState, and PRD 003
// promoted getCellBounds, CellBounds and columnLayout to real core exports
// (see current-api.ts); row-sizing remains provisional.
type RowId = string | number;

interface TargetOptions {
  freezeRows?: { count: number; includeHeader: boolean };
  rowHeight?: number | "auto" | ((rowId: RowId) => number);
}

declare const options: TargetOptions;

void options;
