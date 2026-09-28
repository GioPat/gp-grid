import type { GridInstruction } from "../types";

/** A `SCROLL_TO` the wrapper still has to write; `null` leaves an axis alone. */
export interface PendingScroll {
  top: number | null;
  left: number | null;
}

/**
 * Holds `SCROLL_TO` corrections outside the render state until the wrapper
 * writes them. Batches coalesced into one render must not erase a correction,
 * and taking it must not cost another render.
 */
export class PendingScrollLatch {
  private top: number | null = null;
  private left: number | null = null;

  /** Latch the axes a batch names; a later batch overwrites only its own. */
  collect(instructions: readonly GridInstruction[]): void {
    for (const instruction of instructions) {
      if (instruction.type !== "SCROLL_TO") continue;
      if (instruction.scrollTop !== undefined) this.top = instruction.scrollTop;
      if (instruction.scrollLeft !== undefined) this.left = instruction.scrollLeft;
    }
  }

  /** The latched correction, cleared so each one is written once. */
  take(): PendingScroll | null {
    if (this.top === null && this.left === null) return null;
    const pending = { top: this.top, left: this.left };
    this.clear();
    return pending;
  }

  clear(): void {
    this.top = null;
    this.left = null;
  }
}
