// packages/core/src/managers/instruction-batcher.ts
// Owns the instruction-dispatch pipeline for GridCore: buffering, emit,
// and listener notification. Extracted so grid-core.ts doesn't have to
// hold both the buffer state machine and the orchestration logic.

import type { BatchInstructionListener, GridInstruction } from "../types";

export class InstructionBatcher {
  private listeners: BatchInstructionListener[] = [];
  private buffer: GridInstruction[] | null = null;
  // Open start() calls; only the outermost flush() delivers the batch.
  private depth = 0;

  /**
   * Subscribe to batched instructions. Returns an unsubscribe function.
   * Batch listeners receive arrays of instructions instead of individual ones.
   */
  subscribe(listener: BatchInstructionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Begin buffering. `emit`/`emitBatch` accumulate into an internal buffer
   * until the matching `flush()`. Calls nest: the outermost start() opens
   * the buffer and only the outermost flush() delivers it, so a batched
   * operation can call another batched operation and still emit one batch.
   */
  start(): void {
    if (this.depth === 0) this.buffer = [];
    this.depth += 1;
  }

  /** Close the current start(); the outermost close delivers the batch. */
  flush(): void {
    if (this.depth === 0) return;
    this.depth -= 1;
    if (this.depth > 0) return;
    const buffer = this.buffer;
    this.buffer = null;
    if (buffer !== null && buffer.length > 0) {
      for (const listener of this.listeners) listener(buffer);
    }
  }

  emit(instruction: GridInstruction): void {
    if (this.buffer !== null) {
      this.buffer.push(instruction);
      return;
    }
    this.notify([instruction]);
  }

  emitBatch(instructions: GridInstruction[]): void {
    if (instructions.length === 0) return;
    if (this.buffer !== null) {
      this.buffer.push(...instructions);
      return;
    }
    this.notify(instructions);
  }

  clearListeners(): void {
    this.listeners = [];
  }

  private notify(instructions: GridInstruction[]): void {
    for (const listener of this.listeners) listener(instructions);
  }
}
