// packages/core/src/history/write-history.ts
// The undo and redo stacks of write commands (PRD 013 D4): one entry per
// command that changed a cell, bounded by `maxEntries`.

import type { WriteChange, WriteOperation } from "../types";

export interface HistoryEntry {
  readonly operation: WriteOperation;
  readonly changes: readonly WriteChange[];
}

export class WriteHistory {
  private readonly maxEntries: number;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  constructor(maxEntries: number) {
    this.maxEntries = maxEntries;
  }

  /** An undo or a redo moves entries between the stacks and is never one itself. */
  record(entry: HistoryEntry): void {
    if (entry.changes.length === 0) return;
    if (entry.operation === "undo" || entry.operation === "redo") return;
    this.undoStack.push(entry);
    this.redoStack = [];
    if (this.undoStack.length > this.maxEntries) this.undoStack.shift();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Applies the newest entry; a refused entry is dropped, an applied one moves to redo. */
  undo(apply: (entry: HistoryEntry) => boolean): boolean {
    return this.move(this.undoStack, this.redoStack, apply);
  }

  redo(apply: (entry: HistoryEntry) => boolean): boolean {
    return this.move(this.redoStack, this.undoStack, apply);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private move(from: HistoryEntry[], to: HistoryEntry[], apply: (entry: HistoryEntry) => boolean): boolean {
    const entry = from.pop();
    if (entry === undefined) return false;
    const applied = apply(entry);
    if (applied) to.push(entry);
    return applied;
  }
}
