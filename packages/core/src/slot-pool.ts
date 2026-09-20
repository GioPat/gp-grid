// packages/core/src/slot-pool.ts

import type { SlotState, GridInstruction } from "./types";
import { createBatchInstructionEmitter } from "./utils";

// =============================================================================
// Types
// =============================================================================

export interface SlotPoolManagerOptions {
  /** Overscanned half-open row window the pool should keep mounted. */
  getRowWindow: () => { start: number; end: number };
  /** Displayed view-row count. */
  getRowCount: () => number;
  /** `translateY` of a row inside the rows wrapper (rows space). */
  getRowOffset: (rowIndex: number) => number;
  /** Get row data by index */
  getRowData: (rowIndex: number) => unknown;
  /**
   * Whether the row exists and can be rendered. Distinct from row data: a
   * columnar row renders with no source record.
   */
  isRowAvailable: (rowIndex: number) => boolean;
}

interface SlotPoolState {
  slots: Map<string, SlotState>;
  /** Maps rowIndex to slotId for quick lookup */
  rowToSlot: Map<number, string>;
  nextSlotId: number;
  /** Monotonic assignment generation; every ASSIGN_SLOT increments it. */
  nextGeneration: number;
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
    nextGeneration: 1,
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

  /**
   * Get the current assignment generation for a row, or -1 when no slot
   * currently serves it. Callbacks captured with an older generation are stale.
   */
  getSlotGeneration(rowIndex: number): number {
    const slotId = this.state.rowToSlot.get(rowIndex);
    if (slotId === undefined) return -1;
    return this.state.slots.get(slotId)?.generation ?? -1;
  }

  // ===========================================================================
  // Slot Synchronization
  // ===========================================================================

  /**
   * Synchronize slots with the current row window. The window is half-open
   * and already overscanned, so no row arithmetic happens here.
   */
  syncSlots(): void {
    const window = this.options.getRowWindow();
    if (window.end <= window.start) {
      // No rows to display - destroy all slots
      this.destroyAllSlots();
      return;
    }

    const requiredRows = new Set<number>();
    for (let row = window.start; row < window.end; row++) {
      requiredRows.add(row);
    }

    const instructions: GridInstruction[] = [];

    const slotsToRecycle = this.partitionSlots(requiredRows);

    let recycleIdx = 0;
    for (const rowIndex of requiredRows) {
      if (this.options.isRowAvailable(rowIndex) === false) continue;
      const rowData = this.options.getRowData(rowIndex);
      const recycledSlotId = recycleIdx < slotsToRecycle.length
        ? slotsToRecycle[recycleIdx++]
        : undefined;
      this.assignSlotToRow(rowIndex, rowData, recycledSlotId, instructions);
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
   * Partition existing slots into recyclable and still-needed.
   * Mutates requiredRows: rows that already have a slot are removed.
   */
  private partitionSlots(requiredRows: Set<number>): string[] {
    const slotsToRecycle: string[] = [];
    for (const [slotId, slot] of this.state.slots) {
      if (requiredRows.has(slot.rowIndex)) {
        requiredRows.delete(slot.rowIndex);
      } else {
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
  ): void {
    let slotId: string;
    const generation = this.state.nextGeneration++;

    if (recycledSlotId === undefined) {
      slotId = `slot-${this.state.nextSlotId++}`;
      this.state.slots.set(slotId, {
        slotId,
        rowIndex,
        rowData,
        generation,
        translateY: this.options.getRowOffset(rowIndex),
      });
      instructions.push({ type: "CREATE_SLOT", slotId, generation });
    } else {
      slotId = recycledSlotId;
      const slot = this.state.slots.get(slotId)!;
      slot.rowIndex = rowIndex;
      slot.rowData = rowData;
      slot.generation = generation;
      slot.translateY = this.options.getRowOffset(rowIndex);
    }

    this.state.rowToSlot.set(rowIndex, slotId);
    instructions.push(
      { type: "ASSIGN_SLOT", slotId, rowIndex, rowData, generation },
      { type: "MOVE_SLOT", slotId, translateY: this.options.getRowOffset(rowIndex) },
    );
  }

  /**
   * Push MOVE_SLOT instructions for slots whose position has drifted.
   */
  private updateSlotPositions(instructions: GridInstruction[]): void {
    for (const [slotId, slot] of this.state.slots) {
      const expectedY = this.options.getRowOffset(slot.rowIndex);
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
    const rowCount = this.options.getRowCount();

    for (const [slotId, slot] of this.state.slots) {
      // Check if row index is still valid and data is available
      if (slot.rowIndex >= 0 && slot.rowIndex < rowCount) {
        if (this.options.isRowAvailable(slot.rowIndex) === false) continue;
        const rowData = this.options.getRowData(slot.rowIndex);

        const translateY = this.options.getRowOffset(slot.rowIndex);
        const generation = this.state.nextGeneration++;

        slot.rowData = rowData;
        slot.generation = generation;
        slot.translateY = translateY;

        instructions.push(
          { type: "ASSIGN_SLOT", slotId, rowIndex: slot.rowIndex, rowData, generation },
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
    if (slotId && this.options.isRowAvailable(rowIndex)) {
      const slot = this.state.slots.get(slotId);
      const generation = this.state.nextGeneration++;
      if (slot) slot.generation = generation;
      this.emit({
        type: "ASSIGN_SLOT",
        slotId,
        rowIndex,
        rowData: this.options.getRowData(rowIndex),
        generation,
      });
    }
  }
}
