// packages/core/src/slot-pool.ts

import type { SlotState, GridInstruction } from "./types";
import type { RowRegionLayout } from "./geometry";
import { createBatchInstructionEmitter } from "./utils";
import { planSlotRefresh, planSlotSync, planSlotUpdate, type SlotPlanInput } from "./slot-pool-plan";

// =============================================================================
// Types
// =============================================================================

export interface SlotPoolManagerOptions {
  /** Overscanned half-open suffix row window the pool should keep mounted. */
  getRowWindow: () => { start: number; end: number };
  /** Displayed view-row count. */
  getRowCount: () => number;
  /** C3 layout; the frozen prefix is required in every window (C7). */
  getRowRegions: () => RowRegionLayout;
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
   * Synchronize slots with the frozen prefix and the current suffix window.
   * The window is half-open and already overscanned, so no row arithmetic
   * happens here beyond inserting the prefix (C7).
   */
  syncSlots(): void {
    this.emitBatch(planSlotSync(this.planInput()));
  }

  /**
   * Refresh all slot data without changing which rows are displayed.
   * Used after filtering/sorting when data changes.
   */
  refreshAllSlots(): void {
    this.emitBatch(planSlotRefresh(this.planInput()));
    // Also sync slots to handle any rows that went out of bounds
    this.syncSlots();
  }

  /**
   * Update a single slot's data.
   */
  updateSlot(rowIndex: number): void {
    for (const instruction of planSlotUpdate(this.planInput(), rowIndex)) {
      this.emit(instruction);
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

  /** Live view of the pool's maps and the injected accessors, for the planner. */
  private planInput(): SlotPlanInput {
    const { options, state } = this;
    return {
      slots: state.slots,
      rowToSlot: state.rowToSlot,
      nextSlotId: () => `slot-${state.nextSlotId++}`,
      nextGeneration: () => state.nextGeneration++,
      window: options.getRowWindow(),
      rowCount: options.getRowCount(),
      regions: options.getRowRegions(),
      isRowAvailable: (rowIndex) => options.isRowAvailable(rowIndex),
      getRowData: (rowIndex) => options.getRowData(rowIndex),
      getRowOffset: (rowIndex) => options.getRowOffset(rowIndex),
    };
  }
}
