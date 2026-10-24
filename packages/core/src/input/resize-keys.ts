// packages/core/src/input/resize-keys.ts
// Grid keys acting on the active cell (PRD 007 D4): Alt+Arrow resizes,
// Alt+Shift+Arrow moves and Alt+Enter fits; a double-click on an edge handle
// resolves to the same fit.

import type { GridCore } from "../grid-core";
import type { CellPosition, RowId } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { ResolvedColumn } from "../types/geometry";
import type { KeyEventData, ResizeTarget } from "../types/input";
import { getColumnId } from "../column-model";
import { clampColumnWidth } from "./column-resize-drag";
import { clampRowHeight, type RowResizeCommands } from "./row-resize-drag";

/** Column step of an arrow key, in px, toward the inline end. */
export const COLUMN_RESIZE_STEP = 8;
/** Row step of an arrow key, in px, downward. */
export const ROW_RESIZE_STEP = 4;

/** A grid key or a handle double-click, resolved against its target. */
export type GridResizeAction =
  | { kind: "column-width"; colIndex: number; width: number }
  | { kind: "row-height"; rowIndex: number; height: number }
  | { kind: "column-move"; fromIndex: number; toIndex: number }
  | { kind: "column-fit"; columnId: string }
  | { kind: "row-fit"; rowId: RowId };

const MOVE_DIRECTIONS = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
]);

const resizableColumn = <TData>(
  core: GridCore<TData>,
  colIndex: number,
): ColumnDefinition | null => {
  const column = core.columns.get()[colIndex];
  if (column === undefined || column.resizable === false) return null;
  return column;
};

/** A column's width after one step, or `null` when it cannot be resized. */
const stepColumnWidth = <TData>(
  core: GridCore<TData>,
  colIndex: number,
  delta: number,
): number | null => {
  const column = resizableColumn(core, colIndex);
  const displayed = core.geometry.getColumn(colIndex);
  if (column === null || displayed === undefined) return null;
  return clampColumnWidth(column, displayed.width + delta);
};

const heightOf = <TData>(core: GridCore<TData>, rowIndex: number): number | undefined => {
  const bounds = core.geometry.getRowBounds(rowIndex, "content");
  return bounds === undefined ? undefined : bounds.end - bounds.start;
};

/** A row's height after one step, or `null` outside the row axis. */
const stepRowHeight = <TData>(
  core: GridCore<TData>,
  rowIndex: number,
  delta: number,
  maxRowHeight: number,
): number | null => {
  const height = heightOf(core, rowIndex);
  return height === undefined ? null : clampRowHeight(height + delta, maxRowHeight);
};

const pinOf = (column: ColumnDefinition | undefined): string | null => column?.pinned ?? null;

const sharesRegion = (a: ResolvedColumn, b: ResolvedColumn): boolean =>
  a.region === b.region && pinOf(a.column) === pinOf(b.column);

/**
 * `move` lands a column before the one at its target and adopts that column's
 * pin, so past a region's last column the pair is swapped from the other side.
 */
const moveAfter = (
  definitions: readonly ColumnDefinition[],
  fromIndex: number,
  nextIndex: number,
): GridResizeAction => {
  const following = definitions[nextIndex + 1];
  if (following === undefined || pinOf(following) === pinOf(definitions[nextIndex])) {
    return { kind: "column-move", fromIndex, toIndex: nextIndex + 1 };
  }
  return { kind: "column-move", fromIndex: nextIndex, toIndex: fromIndex };
};

/** Before the previous or after the next displayed column of the same region. */
const resolveColumnMove = <TData>(
  core: GridCore<TData>,
  colIndex: number,
  key: string,
): GridResizeAction | null => {
  const direction = MOVE_DIRECTIONS.get(key);
  const definitions = core.columns.get();
  if (direction === undefined || definitions[colIndex]?.movable === false) return null;
  const displayed = core.geometry.getColumnLayout().columns;
  const position = displayed.findIndex((column) => column.layoutIndex === colIndex);
  const source = displayed[position];
  const neighbor = displayed[position + direction];
  if (source === undefined || neighbor === undefined) return null;
  if (sharesRegion(source, neighbor) === false) return null;
  if (direction < 0) return { kind: "column-move", fromIndex: colIndex, toIndex: neighbor.layoutIndex };
  return moveAfter(definitions, colIndex, neighbor.layoutIndex);
};

const columnStep = <TData>(
  core: GridCore<TData>,
  colIndex: number,
  delta: number,
): GridResizeAction | null => {
  const width = stepColumnWidth(core, colIndex, delta);
  return width === null ? null : { kind: "column-width", colIndex, width };
};

const rowStep = <TData>(
  core: GridCore<TData>,
  rowIndex: number,
  delta: number,
  maxRowHeight: number,
): GridResizeAction | null => {
  if (core.rowHeights.isResizable() === false) return null;
  const height = stepRowHeight(core, rowIndex, delta, maxRowHeight);
  return height === null ? null : { kind: "row-height", rowIndex, height };
};

const columnFit = <TData>(core: GridCore<TData>, colIndex: number): GridResizeAction | null => {
  const column = resizableColumn(core, colIndex);
  return column === null ? null : { kind: "column-fit", columnId: getColumnId(column) };
};

const rowFit = <TData>(core: GridCore<TData>, rowIndex: number): GridResizeAction | null => {
  if (core.rowHeights.isResizable() === false) return null;
  const rowId = core.rows.getViewRow(rowIndex)?.id;
  return rowId === undefined ? null : { kind: "row-fit", rowId };
};

/** Alt+Enter fits the active cell's column, Alt+Shift+Enter its row. */
const resolveFitKey = <TData>(
  core: GridCore<TData>,
  activeCell: CellPosition,
  shiftKey: boolean,
): GridResizeAction | null => {
  if (shiftKey) return rowFit(core, activeCell.row);
  return columnFit(core, activeCell.col);
};

/** The fit a double-click on an edge handle asks for. */
export const resolveHandleFit = <TData>(
  core: GridCore<TData>,
  target: ResizeTarget,
): GridResizeAction | null => {
  if (target.axis === "column") return columnFit(core, target.colIndex);
  return rowFit(core, target.rowIndex);
};

/**
 * Alt+ArrowLeft/Right step the active cell's column, Alt+ArrowUp/Down its
 * row, Alt+Shift+ArrowLeft/Right move its column, and Alt+Enter or
 * Alt+Shift+Enter fit its column or row. `null` means no target: the key is
 * left to the browser.
 */
export const resolveGridResizeKey = <TData>(
  core: GridCore<TData>,
  event: KeyEventData,
  activeCell: CellPosition | null,
  maxRowHeight: number,
): GridResizeAction | null => {
  if (activeCell === null || event.ctrlKey || event.metaKey) return null;
  if (event.key === "Enter") return resolveFitKey(core, activeCell, event.shiftKey);
  if (event.shiftKey) return resolveColumnMove(core, activeCell.col, event.key);
  switch (event.key) {
    case "ArrowRight":
      return columnStep(core, activeCell.col, COLUMN_RESIZE_STEP);
    case "ArrowLeft":
      return columnStep(core, activeCell.col, -COLUMN_RESIZE_STEP);
    case "ArrowDown":
      return rowStep(core, activeCell.row, ROW_RESIZE_STEP, maxRowHeight);
    case "ArrowUp":
      return rowStep(core, activeCell.row, -ROW_RESIZE_STEP, maxRowHeight);
    default:
      return null;
  }
};

/** A step clamped to where the column already is changes nothing and fires nothing. */
const applyColumnWidth = <TData>(core: GridCore<TData>, colIndex: number, width: number): void => {
  if (core.geometry.getColumn(colIndex)?.width === width) return;
  core.columns.setWidth(colIndex, width);
};

const applyRowHeight = <TData>(
  core: GridCore<TData>,
  commands: RowResizeCommands,
  rowIndex: number,
  height: number,
): void => {
  if (heightOf(core, rowIndex) === height) return;
  commands.resizeRow(rowIndex, height);
};

export const applyGridResizeAction = <TData>(
  core: GridCore<TData>,
  commands: RowResizeCommands,
  action: GridResizeAction,
): void => {
  switch (action.kind) {
    case "column-width":
      applyColumnWidth(core, action.colIndex, action.width);
      return;
    case "row-height":
      applyRowHeight(core, commands, action.rowIndex, action.height);
      return;
    case "column-move":
      core.columns.move(action.fromIndex, action.toIndex);
      return;
    case "column-fit":
      core.columns.fit([action.columnId]);
      return;
    case "row-fit":
      core.rowHeights.fit([action.rowId]);
  }
};
