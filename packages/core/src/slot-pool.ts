// packages/core/src/slot-pool.ts

import type {
  SlotState,
  GridInstruction,
  InstructionListener,
  Row,
} from "./types";

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
  getRowData: (rowIndex: number) => Row | undefined;
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
/** Batch instruction listener for efficient React state updates */
export type BatchInstructionListener = (instructions: GridInstruction[]) => void;

export class SlotPoolManager {
  private state: SlotPoolState = {
    slots: new Map(),
    rowToSlot: new Map(),
    nextSlotId: 0,
  };

  private options: SlotPoolManagerOptions;
  private listeners: InstructionListener[] = [];
  private batchListeners: BatchInstructionListener[] = [];
  private isDestroyed: boolean = false;

  constructor(options: SlotPoolManagerOptions) {
    this.options = options;
  }

  // ===========================================================================
  // Instruction Emission
  // ===========================================================================

  onInstruction(listener: InstructionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to batched instructions for efficient state updates.
   */
  onBatchInstruction(listener: BatchInstructionListener): () => void {
    this.batchListeners.push(listener);
    return () => {
      this.batchListeners = this.batchListeners.filter((l) => l !== listener);
    };
  }

  private emit(instruction: GridInstruction): void {
    for (const listener of this.listeners) {
      listener(instruction);
    }
    // Also emit as single-item batch for batch listeners
    for (const listener of this.batchListeners) {
      listener([instruction]);
    }
  }

  private emitBatch(instructions: GridInstruction[]): void {
    if (instructions.length === 0) return;
    // Emit to batch listeners as a single batch
    for (const listener of this.batchListeners) {
      listener(instructions);
    }
    // Also emit to individual listeners for backwards compatibility
    for (const instruction of instructions) {
      for (const listener of this.listeners) {
        listener(instruction);
      }
    }
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

    const visibleStartRow = Math.max(
      0,
      Math.floor(scrollTop / rowHeight) - overscan
    );
    const visibleEndRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
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

    // Find slots that are no longer needed
    const slotsToRecycle: string[] = [];
    for (const [slotId, slot] of this.state.slots) {
      if (!requiredRows.has(slot.rowIndex)) {
        slotsToRecycle.push(slotId);
        this.state.rowToSlot.delete(slot.rowIndex);
      } else {
        requiredRows.delete(slot.rowIndex);
      }
    }

    // Assign recycled slots to new rows
    const rowsNeedingSlots = Array.from(requiredRows);
    for (let i = 0; i < rowsNeedingSlots.length; i++) {
      const rowIndex = rowsNeedingSlots[i]!;
      const rowData = this.options.getRowData(rowIndex);

      if (i < slotsToRecycle.length) {
        // Recycle existing slot
        const slotId = slotsToRecycle[i]!;
        const slot = this.state.slots.get(slotId)!;
        const translateY = this.getRowTranslateY(rowIndex);

        slot.rowIndex = rowIndex;
        slot.rowData = rowData ?? {};
        slot.translateY = translateY;

        this.state.rowToSlot.set(rowIndex, slotId);

        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
      } else {
        // Create new slot
        const slotId = `slot-${this.state.nextSlotId++}`;
        const translateY = this.getRowTranslateY(rowIndex);

        const newSlot: SlotState = {
          slotId,
          rowIndex,
          rowData: rowData ?? {},
          translateY,
        };

        this.state.slots.set(slotId, newSlot);
        this.state.rowToSlot.set(rowIndex, slotId);

        instructions.push({ type: "CREATE_SLOT", slotId });
        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
      }
    }

    // Destroy excess slots
    for (let i = rowsNeedingSlots.length; i < slotsToRecycle.length; i++) {
      const slotId = slotsToRecycle[i]!;
      this.state.slots.delete(slotId);
      instructions.push({ type: "DESTROY_SLOT", slotId });
    }

    // Update positions of existing slots that haven't moved
    for (const [slotId, slot] of this.state.slots) {
      const expectedY = this.getRowTranslateY(slot.rowIndex);
      if (slot.translateY !== expectedY) {
        slot.translateY = expectedY;
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY: expectedY,
        });
      }
    }

    this.emitBatch(instructions);
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
    this.listeners = [];
    this.batchListeners = [];
  }

  /**
   * Refresh all slot data without changing which rows are displayed.
   * Used after filtering/sorting when data changes.
   */
  refreshAllSlots(): void {
    const instructions: GridInstruction[] = [];
    const totalRows = this.options.getTotalRows();

    for (const [slotId, slot] of this.state.slots) {
      // Check if row index is still valid
      if (slot.rowIndex >= 0 && slot.rowIndex < totalRows) {
        const rowData = this.options.getRowData(slot.rowIndex);
        const translateY = this.getRowTranslateY(slot.rowIndex);

        slot.rowData = rowData ?? {};
        slot.translateY = translateY;

        instructions.push({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex: slot.rowIndex,
          rowData: rowData ?? {},
        });
        instructions.push({
          type: "MOVE_SLOT",
          slotId,
          translateY,
        });
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
      const rowData = this.options.getRowData(rowIndex);
      if (rowData) {
        this.emit({
          type: "ASSIGN_SLOT",
          slotId,
          rowIndex,
          rowData,
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
   */
  private getRowTranslateY(rowIndex: number): number {
    const rowHeight = this.options.getRowHeight();
    const headerHeight = this.options.getHeaderHeight();
    const scrollRatio = this.options.getScrollRatio();
    const virtualContentHeight = this.options.getVirtualContentHeight();
    const scrollTop = this.options.getScrollTop();

    // Calculate the natural position for this row
    const naturalY = rowIndex * rowHeight + headerHeight;

    if (scrollRatio >= 1) {
      return naturalY;
    }

    // With scroll virtualization, we need to position rows relative to the viewport
    // so they appear at the correct location within the capped container height.
    //
    // scrollTop is where we are in "real" content space (already mapped from virtual)
    // virtualScrollTop is where the browser thinks we are in the DOM
    // offset = the difference we need to subtract to keep rows within bounds
    const naturalScrollTop = scrollTop;
    const virtualScrollTop = naturalScrollTop * scrollRatio;
    const offset = naturalScrollTop - virtualScrollTop;

    // Position row at its natural Y minus the offset
    // Clamp to ensure it stays within virtual container bounds (0 to virtualContentHeight)
    // This prevents floating point precision issues at extreme scroll positions
    const translateY = naturalY - offset;
    return Math.max(0, Math.min(translateY, virtualContentHeight));
  }
}
