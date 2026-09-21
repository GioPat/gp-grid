// packages/core/src/types/events.ts
// Object-shaped column/row interaction events shared by every wrapper.

import type { RowId } from "./basic";
import type { ColumnId } from "./columns";
import type { ColumnPin } from "./geometry";

/** Emitted after a column width command. `viewIndex` is the resolved-layout index. */
export interface ColumnResizedEvent {
  columnId: ColumnId;
  /** Displayed width after redistribution, in pixels. */
  width: number;
  viewIndex: number;
}

/** Emitted after a column move command. Indices are resolved-layout positions. */
export interface ColumnMovedEvent {
  columnId: ColumnId;
  fromViewIndex: number;
  toViewIndex: number;
}

/** Emitted after a column's requested pin changed; `null` means unpinned. */
export interface ColumnPinnedEvent {
  columnId: ColumnId;
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
