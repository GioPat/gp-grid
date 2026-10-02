// packages/core/src/types/events.ts
// Object-shaped column/row interaction events shared by every wrapper.

import type { RowId } from "./basic";
import type { ColumnPin } from "./geometry";

/** Emitted after a column width command. `viewIndex` is the resolved-layout index. */
export interface ColumnResizedEvent {
  columnId: string;
  /** Displayed width after redistribution, in pixels. */
  width: number;
  viewIndex: number;
}

/**
 * Emitted per row whose height a drag, a key or a fit changed; `rowHeights.set`
 * stays silent. `viewIndex` is the row's view index.
 */
export interface RowResizedEvent {
  rowId: RowId;
  /** Height after the change, in pixels. */
  height: number;
  viewIndex: number;
}

/** Emitted after a column move command. Indices are resolved-layout positions. */
export interface ColumnMovedEvent {
  columnId: string;
  fromViewIndex: number;
  toViewIndex: number;
}

/** Emitted after a column's requested pin changed; `null` means unpinned. */
export interface ColumnPinnedEvent {
  columnId: string;
  pinned: ColumnPin | null;
}

/**
 * Emitted after a row drag commit. `rowId` is the dragged row's source
 * identity, or its view index before the move when the source exposes none.
 */
export interface RowDragEndEvent {
  rowId: RowId;
  fromViewIndex: number;
  toViewIndex: number;
}
