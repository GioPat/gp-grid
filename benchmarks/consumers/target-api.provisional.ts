// Provisional target vocabulary used to check examples in the PRD 001 API
// review. These declarations are intentionally local until their owning PRDs
// implement and export the contracts. PRD 002 promoted ColumnId, ViewRow,
// getViewRow, getRecordById, setColumnState and resetColumnState to real core
// exports (see current-api.ts); geometry and row-sizing remain provisional.
type RowId = string | number;
type ColumnId = string;

interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "content" | "viewport";
}

interface TargetGridApi<TData> {
  getCellBounds(rowId: RowId, columnId: ColumnId, space: CellBounds["coordinateSpace"]): CellBounds | undefined;
}

interface TargetOptions {
  freezeRows?: { count: number; includeHeader: boolean };
  rowHeight?: number | "auto" | ((rowId: RowId) => number);
  columnLayout?: "fit" | "fixed";
}

declare const grid: TargetGridApi<{ id: number; name: string }>;
declare const options: TargetOptions;
const nameBounds = grid.getCellBounds(1, "name", "viewport");

void options;
void nameBounds;
