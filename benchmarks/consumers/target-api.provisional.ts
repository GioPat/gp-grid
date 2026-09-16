// Provisional target vocabulary used to check examples in the PRD 001 API
// review. These declarations are intentionally local until their owning PRDs
// implement and export the contracts.
type RowId = string | number;
type ColumnId = string;

interface ViewRow<TData> {
  id: RowId;
  kind: "record" | "group" | "aggregate" | "placeholder";
  record?: TData;
  viewIndex: number;
}

interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: "content" | "viewport";
}

interface TargetGridApi<TData> {
  getRowData(viewIndex: number): TData | undefined;
  getViewRow(viewIndex: number): ViewRow<TData> | undefined;
  getRecordById(rowId: RowId): TData | undefined;
  getCellBounds(rowId: RowId, columnId: ColumnId, space: CellBounds["coordinateSpace"]): CellBounds | undefined;
  setColumnState(state: { columnId: ColumnId; width?: number; hidden?: boolean }[]): void;
  resetColumnState(columnIds?: ColumnId[]): void;
}

interface TargetOptions {
  freezeRows?: { count: number; includeHeader: boolean };
  rowHeight?: number | "auto" | ((rowId: RowId) => number);
  columnLayout?: "fit" | "fixed";
}

declare const grid: TargetGridApi<{ id: number; name: string }>;
declare const options: TargetOptions;
const frozenRecord = grid.getViewRow(0);
const nameBounds = grid.getCellBounds(1, "name", "viewport");

void options;
void frozenRecord;
void nameBounds;
