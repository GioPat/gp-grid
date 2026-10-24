// PRD 013 D4: the undo and redo stacks and their bound (AC-013-05).

import { describe, expect, it, vi } from "vitest";
import { WriteHistory, type HistoryEntry } from "../src/history/write-history";
import type { WriteOperation } from "../src/types";

const entry = (operation: WriteOperation, ...values: number[]): HistoryEntry => ({
  operation,
  changes: values.map((value) => ({ rowId: value, columnId: "a", field: "a", oldValue: value, newValue: value + 1 })),
});

describe("WriteHistory", () => {
  it("records a command with changes and nothing else", () => {
    const history = new WriteHistory(5);
    history.record(entry("edit"));
    history.record(entry("undo", 1));
    history.record(entry("redo", 1));
    expect(history.canUndo()).toBe(false);

    history.record(entry("paste", 1, 2));
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("undo moves an applied entry to redo and redo moves it back", () => {
    const history = new WriteHistory(5);
    const first = entry("edit", 1);
    history.record(first);
    const apply = vi.fn(() => true);

    expect(history.undo(apply)).toBe(true);
    expect(apply).toHaveBeenCalledExactlyOnceWith(first);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    expect(history.redo(apply)).toBe(true);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it("drops a refused entry and leaves the other stack alone", () => {
    const history = new WriteHistory(5);
    history.record(entry("edit", 1));
    history.record(entry("edit", 2));
    expect(history.undo(() => true)).toBe(true);
    expect(history.undo(() => false)).toBe(false);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    expect(history.redo(() => false)).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("answers false on an empty stack without applying", () => {
    const history = new WriteHistory(5);
    const apply = vi.fn(() => true);
    expect(history.undo(apply)).toBe(false);
    expect(history.redo(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("a new entry clears redo", () => {
    const history = new WriteHistory(5);
    history.record(entry("edit", 1));
    history.undo(() => true);
    history.record(entry("fill", 2));
    expect(history.canRedo()).toBe(false);
  });

  it("evicts the oldest entry over maxEntries", () => {
    const history = new WriteHistory(2);
    const applied: number[] = [];
    for (const value of [1, 2, 3]) history.record(entry("edit", value));

    while (history.undo((applied_) => applied.push(applied_.changes[0]!.rowId as number) > 0));

    expect(applied).toEqual([3, 2]);
  });

  it("clear empties both stacks", () => {
    const history = new WriteHistory(5);
    history.record(entry("edit", 1));
    history.record(entry("edit", 2));
    history.undo(() => true);
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
