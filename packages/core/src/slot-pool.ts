// packages/core/src/slot-pool.ts

import type { SlotState, GridInstruction } from "./types";
import type { PresentationRow } from "./row-grouping";
import { createBatchInstructionEmitter } from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface SlotPoolManagerOptions {
  /** Get current row height */
  getRowHeight: () => number;
  /** Get current header height */
  getHeaderHeight: () => number;
  /** Get overscan count */
  getOverscan: () => number;
  /** Get current scroll top position (natural, not virtual) */
  getScrollTop: () => number;
  /** Get viewport height */
  getViewportHeight: () => number;
  /** Get total row count */
  getTotalRows: () => number;
  /** Get scroll ratio for virtualization (1 = no virtualization) */
  getScrollRatio: () => number;
  /** Get virtual content height */
  getVirtualContentHeight: () => number;
  /** Get row data by index */
  getRowData: (rowIndex: number) => unknown;
  /** Get presentation row metadata by index */
  getPresentationRow?: (rowIndex: number) => PresentationRow | undefined;
}

interface SlotPoolState {
  slots: Map<string, SlotState>;
  /** Maps rowIndex to slotId for quick lookup */
  rowToSlot: Map<number, string>;
  nextSlotId: number;
}

// =============================================================================
// SlotPoolManager
// =============================================================================

/**
 * Manages the slot pool for virtual scrolling.
 * Handles slot creation, recycling, positioning, and destruction.
 */
export class SlotPoolManager {
  private readonly state: SlotPoolState = {
    slots: new Map(),
    rowToSlot: new Map(),
    nextSlotId: 0,
  };

  private readonly options: SlotPoolManagerOptions;
  private readonly emitter = createBatchInstructionEmitter();
  private isDestroyed: boolean = false;

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  onBatchInstruction = this.emitter.onBatchInstruction;
  private readonly emit = this.emitter.emit;
  private readonly emitBatch = this.emitter.emitBatch;

  constructor(options: SlotPoolManagerOptions) {
    this.options = options;
  }

  // ===========================================================================
  // State Accessors
  // ===========================================================================

  /**
   * Get the slot ID for a given row index.
   */
  getSlotForRow(rowIndex: number): string | undefined {
    return this.state.rowToSlot.get(rowIndex);
  }

  /**
   * Get all current slots.
   */
  getSlots(): Map<string, SlotState> {
    return this.state.slots;
  }

  // ===========================================================================
  // Slot Synchronization
  // ===========================================================================

  /**
   * Synchronize slots with current viewport position.
   * This implements the slot recycling strategy.
   */
  syncSlots(): void {
    const scrollTop = this.options.getScrollTop();
    const rowHeight = this.options.getRowHeight();
    const viewportHeight = this.options.getViewportHeight();
    const totalRows = this.options.getTotalRows();
    const overscan = this.options.getOverscan();

    // The header is rendered outside the scroll container, so viewportHeight
    // already represents only the body content area
    const contentHeight = viewportHeight;

    const visibleStartRow = Math.max(
      0,
      Math.floor(scrollTop / rowHeight) - overscan
    );
    const visibleEndRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + contentHeight) / rowHeight) + overscan
    );

    if (totalRows === 0 || visibleEndRow < visibleStartRow) {
      // No rows to display - destroy all slots
      this.destroyAllSlots();
      return;
    }

    const requiredRows = new Set<number>();
    for (let row = visibleStartRow; row <= visibleEndRow; row++) {
      requiredRows.add(row);
    }

    const instructions: GridInstruction[] = [];

    const slotsToRecycle = this.collectRecyclableSlots(requiredRows);

    let recycleIdx = 0;
    for (const rowIndex of requiredRows) {
      const presentationRow = this.options.getPresentationRow?.(rowIndex);
      const rowData = getPresentationRowData(presentationRow, this.options.getRowData(rowIndex));
      if (rowData === undefined) continue;
      const existingSlotId = this.state.rowToSlot.get(rowIndex);
      const targetSlotId = existingSlotId ?? (
        recycleIdx < slotsToRecycle.length ? slotsToRecycle[recycleIdx++] : undefined
      );
      this.assignSlotToRow(rowIndex, rowData, targetSlotId, instructions, presentationRow);
    }

    for (let i = recycleIdx; i < slotsToRecycle.length; i++) {
      const slotId = slotsToRecycle[i]!;
      this.state.slots.delete(slotId);
      instructions.push({ type: "DESTROY_SLOT", slotId });
    }

    this.updateSlotPositions(instructions);

    this.emitBatch(instructions);
  }

  /**
   * Collect slots that can be reassigned while keeping required rows in place.
   */
  private collectRecyclableSlots(requiredRows: Set<number>): string[] {
    const slotsToRecycle: string[] = [];
    for (const [slotId, slot] of this.state.slots) {
      if (!requiredRows.has(slot.rowIndex)) {
        slotsToRecycle.push(slotId);
        this.state.rowToSlot.delete(slot.rowIndex);
      }
    }
    return slotsToRecycle;
  }

  /**
   * Assign a row to a recycled or newly created slot.
   */
  private assignSlotToRow(
    rowIndex: number,
    rowData: unknown,
    recycledSlotId: string | undefined,
    instructions: GridInstruction[],
    presentationRow: PresentationRow | undefined,
  ): void {
    let slotId: string;

    if (recycledSlotId === undefined) {
      slotId = `slot-${this.state.nextSlotId++}`;
      this.state.slots.set(slotId, {
        slotId,
        rowIndex,
        rowData,
        translateY: this.getRowTranslateY(rowIndex),
        ...getSlotMetadata(presentationRow),
      });
      instructions.push({ type: "CREATE_SLOT", slotId });
    } else {
      slotId = recycledSlotId;
      const slot = this.state.slots.get(slotId)!;
      slot.rowIndex = rowIndex;
      slot.rowData = rowData;
      slot.translateY = this.getRowTranslateY(rowIndex);
      Object.assign(slot, getSlotMetadata(presentationRow));
    }

    this.state.rowToSlot.set(rowIndex, slotId);
    instructions.push(
      { type: "ASSIGN_SLOT", slotId, rowIndex, rowData, ...getSlotMetadata(presentationRow) },
      { type: "MOVE_SLOT", slotId, translateY: this.getRowTranslateY(rowIndex) },
    );
  }

  /**
   * Push MOVE_SLOT instructions for slots whose position has drifted.
   */
  private updateSlotPositions(instructions: GridInstruction[]): void {
    for (const [slotId, slot] of this.state.slots) {
      const expectedY = this.getRowTranslateY(slot.rowIndex);
      if (slot.translateY !== expectedY) {
        slot.translateY = expectedY;
        instructions.push({ type: "MOVE_SLOT", slotId, translateY: expectedY });
      }
    }
  }

  /**
   * Destroy all slots.
   */
  destroyAllSlots(): void {
    const instructions: GridInstruction[] = [];
    for (const slotId of this.state.slots.keys()) {
      instructions.push({ type: "DESTROY_SLOT", slotId });
    }
    this.state.slots.clear();
    this.state.rowToSlot.clear();
    this.emitBatch(instructions);
  }

  /**
   * Clean up resources for garbage collection.
   * This method is idempotent - safe to call multiple times.
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    // Clear slots without emitting (no listeners to notify during cleanup)
    this.state.slots.clear();
    this.state.rowToSlot.clear();
    this.emitter.clearListeners();
  }

  /**
   * Refresh all slot data without changing which rows are displayed.
   * Used after filtering/sorting when data changes.
   */
  refreshAllSlots(): void {
    const instructions: GridInstruction[] = [];
    const totalRows = this.options.getTotalRows();

    for (const [slotId, slot] of this.state.slots) {
      // Check if row index is still valid and data is available
      if (slot.rowIndex >= 0 && slot.rowIndex < totalRows) {
        const presentationRow = this.options.getPresentationRow?.(slot.rowIndex);
        const rowData = getPresentationRowData(
          presentationRow,
          this.options.getRowData(slot.rowIndex),
        );
        if (rowData === undefined) continue;

        const translateY = this.getRowTranslateY(slot.rowIndex);

        slot.rowData = rowData;
        slot.translateY = translateY;
        Object.assign(slot, getSlotMetadata(presentationRow));

        instructions.push(
          {
            type: "ASSIGN_SLOT",
            slotId,
            rowIndex: slot.rowIndex,
            rowData,
            ...getSlotMetadata(presentationRow),
          },
          { type: "MOVE_SLOT", slotId, translateY },
        );
      }
    }

    this.emitBatch(instructions);

    // Also sync slots to handle any rows that went out of bounds
    this.syncSlots();
  }

  /**
   * Update a single slot's data.
   */
  updateSlot(rowIndex: number): void {
    const slotId = this.state.rowToSlot.get(rowIndex);
    if (slotId) {
      const presentationRow = this.options.getPresentationRow?.(rowIndex);
      const rowData = getPresentationRowData(
        presentationRow,
        this.options.getRowData(rowIndex),
      );
      if (rowData) {
        this.emit({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData,
          ...getSlotMetadata(presentationRow),
        });
      }
    }
  }

  // ===========================================================================
  // Position Calculation
  // ===========================================================================

  /**
   * Calculate the translateY position for a row.
   * Handles scroll virtualization for very large datasets.
   *
   * When virtualization is active (scrollRatio < 1), we use viewport-relative
   * positioning to keep translateY values small. This prevents browser rendering
   * issues that occur at extreme pixel values (millions of pixels).
   *
   * Note: The header is rendered outside the content sizer, so row positions
   * start at 0 (not headerHeight) within the rows container.
   */
  private getRowTranslateY(rowIndex: number): number {
    const rowHeight = this.options.getRowHeight();
    const scrollRatio = this.options.getScrollRatio();
    const scrollTop = this.options.getScrollTop();

    // Calculate the natural position for this row (no headerHeight since header is outside)
    const naturalY = rowIndex * rowHeight;

    if (scrollRatio >= 1) {
      return naturalY;
    }

    // With virtualization active, position rows relative to the first visible row.
    // This keeps translateY values small (0 to viewportHeight + overscan buffer)
    // instead of millions of pixels.
    const firstVisibleRowIndex = Math.floor(scrollTop / rowHeight);
    const firstVisibleRowY = firstVisibleRowIndex * rowHeight;

    // Row's position relative to first visible row
    return naturalY - firstVisibleRowY;
  }

  /**
   * Get the translateY position for a row inside the rows wrapper.
   * Public accessor for use by input handler (e.g., drop indicator positioning).
   */
  getRowTranslateYForIndex(rowIndex: number): number {
    return this.getRowTranslateY(rowIndex);
  }

  /**
   * Get the Y offset for the rows wrapper container.
   * When virtualization is active, this positions the wrapper so rows
   * with small translateY values appear at the correct scroll position.
   */
  getRowsWrapperOffset(): number {
    const scrollRatio = this.options.getScrollRatio();
    const scrollTop = this.options.getScrollTop();
    const rowHeight = this.options.getRowHeight();

    if (scrollRatio >= 1) {
      return 0; // No wrapper offset needed without virtualization
    }

    // Position wrapper at the virtual scroll position of the first visible row
    const firstVisibleRowIndex = Math.floor(scrollTop / rowHeight);
    const firstVisibleRowY = firstVisibleRowIndex * rowHeight;
    return firstVisibleRowY * scrollRatio;
  }
}

const getPresentationRowData = (
  row: PresentationRow | undefined,
  fallback: unknown,
): unknown => {
  if (!row) return fallback;
  if (row.kind === "data") return row.rowData;
  return row;
};

const getSlotMetadata = (
  row: PresentationRow | undefined,
): Pick<
  SlotState,
  | "rowKind"
  | "sourceRowIndex"
  | "groupKey"
  | "groupDepth"
  | "groupField"
  | "groupValue"
  | "groupChildCount"
  | "groupExpanded"
> => {
  if (!row) return { rowKind: "data" };
  if (row.kind === "data") {
    return {
      rowKind: "data",
      sourceRowIndex: row.rowIndex,
      groupKey: undefined,
      groupDepth: undefined,
      groupField: undefined,
      groupValue: undefined,
      groupChildCount: undefined,
      groupExpanded: undefined,
    };
  }
  return {
    rowKind: "group",
    sourceRowIndex: undefined,
    groupKey: row.groupKey,
    groupDepth: row.depth,
    groupField: row.field,
    groupValue: row.value,
    groupChildCount: row.childCount,
    groupExpanded: row.expanded,
  };
};
