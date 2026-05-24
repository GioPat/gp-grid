// packages/core/tests/peek.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import { applyInstruction } from "../src/state-reducer";
import { applyBatchInstructions } from "../src/adapter/batch-applier";
import { bindPeekSelectAll } from "../src/utils/peek-select-all";
import type {
  BatchChangeSetters,
  ColumnDefinition,
  GridInstruction,
} from "../src/types";

interface Row {
  id: number;
  name: string;
  bio: string;
  locked: string;
}

const data: Row[] = [
  { id: 1, name: "A", bio: "first bio", locked: "X" },
  { id: 2, name: "B", bio: "second bio", locked: "Y" },
];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50, editable: true },
  { field: "name", cellDataType: "text", width: 100 },
  { field: "bio", cellDataType: "text", width: 200 },
  { field: "locked", cellDataType: "text", width: 100, peekable: false },
];

const makeGrid = (): GridCore<Row> => {
  const dataSource = createClientDataSource(JSON.parse(JSON.stringify(data)) as Row[]);
  return new GridCore<Row>({
    columns: [...columns],
    dataSource,
    rowHeight: 32,
    headerHeight: 40,
  });
};

const makeSetters = (): BatchChangeSetters => ({
  setContentWidth: vi.fn(),
  setContentHeight: vi.fn(),
  setRowsWrapperOffset: vi.fn(),
  setIsLoading: vi.fn(),
  setErrorMessage: vi.fn(),
  setTotalRows: vi.fn(),
  setPendingScrollTop: vi.fn(),
  setActiveCell: vi.fn(),
  setSelectionRange: vi.fn(),
  setEditingCell: vi.fn(),
  setHoverPosition: vi.fn(),
  setPeekCell: vi.fn(),
  setColumnsOverride: vi.fn(),
  onFilterPopupChange: vi.fn(),
});

describe("Peek state on GridCore", () => {
  let grid: GridCore<Row>;
  let batches: GridInstruction[][];

  beforeEach(async () => {
    grid = makeGrid();
    batches = [];
    grid.onBatchInstruction((b) => batches.push(b));
    await grid.initialize();
    batches.length = 0;
  });

  it("startPeek sets state and emits START_PEEK", () => {
    const ok = grid.startPeek(0, 2);
    expect(ok).toBe(true);
    expect(grid.getPeekState()).toEqual({ row: 0, col: 2 });
    expect(batches.flat().some((i) => i.type === "START_PEEK")).toBe(true);
  });

  it("startPeek refuses when column.peekable is false", () => {
    const ok = grid.startPeek(0, 3);
    expect(ok).toBe(false);
    expect(grid.getPeekState()).toBeNull();
  });

  it("startPeek refuses when an edit is in progress", () => {
    grid.startEdit(0, 0);
    expect(grid.getEditState()).not.toBeNull();
    const ok = grid.startPeek(0, 2);
    expect(ok).toBe(false);
  });

  it("startEdit closes an open peek", () => {
    grid.startPeek(0, 2);
    expect(grid.getPeekState()).not.toBeNull();
    grid.startEdit(0, 0);
    expect(grid.getPeekState()).toBeNull();
  });

  it("stopPeek clears state and emits STOP_PEEK", () => {
    grid.startPeek(0, 2);
    batches.length = 0;
    grid.stopPeek();
    expect(grid.getPeekState()).toBeNull();
    expect(batches.flat().some((i) => i.type === "STOP_PEEK")).toBe(true);
  });

  it("stopPeek is a no-op when no peek is open", () => {
    grid.stopPeek();
    expect(batches.flat().some((i) => i.type === "STOP_PEEK")).toBe(false);
  });
});

describe("Input handler dblclick routing", () => {
  let grid: GridCore<Row>;

  beforeEach(async () => {
    grid = makeGrid();
    await grid.initialize();
  });

  it("double-click on a non-editable peekable cell opens peek", () => {
    grid.input.handleCellDoubleClick(0, 2);
    expect(grid.getPeekState()).toEqual({ row: 0, col: 2 });
    expect(grid.getEditState()).toBeNull();
  });

  it("double-click on an editable cell starts edit, not peek", () => {
    grid.input.handleCellDoubleClick(0, 0);
    expect(grid.getEditState()).not.toBeNull();
    expect(grid.getPeekState()).toBeNull();
  });
});

describe("Keyboard handler while peek is open", () => {
  let grid: GridCore<Row>;

  beforeEach(async () => {
    grid = makeGrid();
    await grid.initialize();
    grid.startPeek(0, 2);
  });

  it("Ctrl+A is not intercepted (browser handles selection inside the peek)", () => {
    const selectAllSpy = vi.spyOn(grid.selection, "selectAll");
    const result = grid.input.handleKeyDown(
      { key: "a", ctrlKey: true, metaKey: false, shiftKey: false },
      null,
      null,
      false,
    );
    expect(result.preventDefault).toBe(false);
    expect(selectAllSpy).not.toHaveBeenCalled();
  });

  it("Escape closes the peek", () => {
    const result = grid.input.handleKeyDown(
      { key: "Escape", ctrlKey: false, metaKey: false, shiftKey: false },
      null,
      null,
      false,
    );
    expect(result.preventDefault).toBe(true);
    expect(grid.getPeekState()).toBeNull();
  });

  it("arrow keys do not move grid focus while peek is open", () => {
    const moveFocusSpy = vi.spyOn(grid.selection, "moveFocus");
    const result = grid.input.handleKeyDown(
      { key: "ArrowDown", ctrlKey: false, metaKey: false, shiftKey: false },
      null,
      null,
      false,
    );
    expect(result.preventDefault).toBe(false);
    expect(moveFocusSpy).not.toHaveBeenCalled();
  });
});

describe("State reducer peek instructions", () => {
  it("START_PEEK returns peekCell", () => {
    const changes = applyInstruction(
      { type: "START_PEEK", row: 3, col: 4 },
      new Map(),
      new Map(),
    );
    expect(changes?.peekCell).toEqual({ row: 3, col: 4 });
  });

  it("STOP_PEEK clears peekCell", () => {
    const changes = applyInstruction({ type: "STOP_PEEK" }, new Map(), new Map());
    expect(changes?.peekCell).toBeNull();
  });
});

describe("Batch applier propagates peekCell to setters", () => {
  it("calls setPeekCell with the new position on START_PEEK", () => {
    const setters = makeSetters();
    applyBatchInstructions(
      [{ type: "START_PEEK", row: 1, col: 2 }],
      new Map(),
      new Map(),
      setters,
    );
    expect(setters.setPeekCell).toHaveBeenCalledWith({ row: 1, col: 2 });
  });

  it("calls setPeekCell(null) on STOP_PEEK", () => {
    const setters = makeSetters();
    applyBatchInstructions([{ type: "STOP_PEEK" }], new Map(), new Map(), setters);
    expect(setters.setPeekCell).toHaveBeenCalledWith(null);
  });
});

describe("bindPeekSelectAll", () => {
  let overlay: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    overlay = document.createElement("div");
    overlay.textContent = "peek content here";
    document.body.appendChild(overlay);
    cleanup = bindPeekSelectAll(overlay);
  });

  const dispatchKey = (init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
  };

  it("intercepts Ctrl+A and scopes Selection to the overlay", () => {
    const event = dispatchKey({ key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe("peek content here");
    cleanup();
    overlay.remove();
  });

  it("also handles Meta+A (macOS Cmd)", () => {
    const event = dispatchKey({ key: "a", metaKey: true });
    expect(event.defaultPrevented).toBe(true);
    cleanup();
    overlay.remove();
  });

  it("ignores plain A without a modifier", () => {
    const event = dispatchKey({ key: "a" });
    expect(event.defaultPrevented).toBe(false);
    cleanup();
    overlay.remove();
  });

  it("ignores other Ctrl shortcuts (e.g. Ctrl+C)", () => {
    const event = dispatchKey({ key: "c", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    cleanup();
    overlay.remove();
  });

  it("cleanup removes the listener", () => {
    cleanup();
    const event = dispatchKey({ key: "a", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    overlay.remove();
  });
});
