import type { GridCore } from "../grid-core";
import type { CellPosition } from "../types/basic";
import type { KeyEventData, KeyboardResult } from "../types/input";
import type { RowGroupResult } from "../types/row-groups";
import type { Direction } from "../selection";
import { applyGridResizeAction, resolveGridResizeKey } from "./resize-keys";
import type { RowResizeCommands } from "./row-resize-drag";

const ARROW_DIRECTIONS = new Map<string, Direction>([
  ["ArrowUp", "up"],
  ["ArrowDown", "down"],
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
]);

type EditingCell = { row: number; col: number } | null;

/** Commands a gesture runs past the public API; only a gesture fires `onRowGroupToggled`. */
export interface InputCommands extends RowResizeCommands {
  toggleGroupAt(viewIndex: number): RowGroupResult;
}

export const isGroupRow = <TData>(core: GridCore<TData>, row: number): boolean =>
  core.rows.getViewRow(row)?.kind === "group";

const isResizeKey = (key: string): boolean => key === "Enter" || ARROW_DIRECTIONS.has(key);

export class KeyboardHandler<TData = unknown> {
  private readonly core: GridCore<TData>;
  private readonly commands: InputCommands;

  constructor(core: GridCore<TData>, commands: InputCommands) {
    this.core = core;
    this.commands = commands;
  }

  handle(
    event: KeyEventData,
    activeCell: CellPosition | null,
    editingCell: EditingCell,
    filterPopupOpen: boolean,
  ): KeyboardResult {
    if (filterPopupOpen) return { preventDefault: false };

    // Peek overlay is read-only; only intercept Escape (to close it) and let
    // every other key reach the browser so Ctrl+A, text selection, etc. work
    // inside the peek content.
    if (this.core.edit.getPeekState() !== null) {
      if (event.key === "Escape") {
        this.core.edit.stopPeek();
        return { preventDefault: true };
      }
      return { preventDefault: false };
    }

    const editingAndNotSpecialKey =
      editingCell !== null &&
      event.key !== "Enter" &&
      event.key !== "Escape" &&
      event.key !== "Tab";
    if (editingAndNotSpecialKey) return { preventDefault: false };

    // With an editor open, Alt+Enter commits like Enter.
    const resizeKey = event.altKey === true && editingCell === null && isResizeKey(event.key);
    if (resizeKey) return this.resizeFromKey(event, activeCell);
    if (this.toggleGroup(event.key, activeCell, editingCell)) return { preventDefault: true };

    const direction = ARROW_DIRECTIONS.get(event.key);
    if (direction) return this.moveFocus(direction, event.shiftKey);

    const isCtrl = event.ctrlKey || event.metaKey;
    return this.handleAction(event.key, activeCell, editingCell, event.shiftKey, isCtrl);
  }

  /**
   * Alt+Arrow and Alt+Enter never move focus. Without a target they are left
   * to the browser; a handled one prevents the browser's history navigation.
   */
  private resizeFromKey(event: KeyEventData, activeCell: CellPosition | null): KeyboardResult {
    const action = resolveGridResizeKey(this.core, event, activeCell, this.commands.maxRowHeight);
    if (action === null) return { preventDefault: false };
    applyGridResizeAction(this.core, this.commands, action);
    if (action.kind === "column-move") {
      return { preventDefault: true, scrollToCell: this.core.selection.getActiveCell() ?? undefined };
    }
    return { preventDefault: true };
  }

  /** Enter and Space on a group row toggle it instead of opening an editor. */
  private toggleGroup(key: string, activeCell: CellPosition | null, editingCell: EditingCell): boolean {
    if (editingCell !== null || activeCell === null) return false;
    if (key !== "Enter" && key !== " ") return false;
    if (isGroupRow(this.core, activeCell.row) === false) return false;
    this.commands.toggleGroupAt(activeCell.row);
    return true;
  }

  private moveFocus(direction: Direction, isShift: boolean): KeyboardResult {
    this.core.edit.stopPeek();
    const { selection } = this.core;
    selection.moveFocus(direction, isShift);
    const newActiveCell = selection.getActiveCell();
    return { preventDefault: true, scrollToCell: newActiveCell ?? undefined };
  }

  private handleAction(
    key: string,
    activeCell: CellPosition | null,
    editingCell: EditingCell,
    isShift: boolean,
    isCtrl: boolean,
  ): KeyboardResult {
    switch (key) {
      case "Enter":
        return this.handleEnter(activeCell, editingCell);
      case "Escape":
        return this.handleEscape(editingCell);
      case "Tab":
        return this.handleTab(editingCell, isShift);
      default:
        return this.handleNonSpecialKey(key, activeCell, editingCell, isCtrl);
    }
  }

  private handleEnter(activeCell: CellPosition | null, editingCell: EditingCell): KeyboardResult {
    if (editingCell) this.core.edit.commit();
    else if (activeCell) this.core.edit.start(activeCell.row, activeCell.col);
    return { preventDefault: true };
  }

  private handleEscape(editingCell: EditingCell): KeyboardResult {
    if (editingCell) {
      this.core.edit.cancel();
    } else if (this.core.edit.getPeekState()) {
      this.core.edit.stopPeek();
    } else {
      this.core.selection.clearSelection();
    }
    return { preventDefault: true };
  }

  private handleTab(editingCell: EditingCell, isShift: boolean): KeyboardResult {
    if (editingCell) this.core.edit.commit();
    this.core.selection.moveFocus(isShift ? "left" : "right", false);
    return { preventDefault: true };
  }

  private handleNonSpecialKey(
    key: string,
    activeCell: CellPosition | null,
    editingCell: EditingCell,
    isCtrl: boolean,
  ): KeyboardResult {
    const { selection } = this.core;

    if (key === "a" && isCtrl) {
      selection.selectAll();
      return { preventDefault: true };
    }
    if (key === "c" && isCtrl) {
      selection.copySelectionToClipboard();
      return { preventDefault: true };
    }
    if (key === "F2") {
      if (activeCell && !editingCell) {
        this.core.edit.start(activeCell.row, activeCell.col);
      }
      return { preventDefault: true };
    }
    if (key === "Delete" || key === "Backspace") {
      if (activeCell && !editingCell) {
        this.core.edit.start(activeCell.row, activeCell.col);
        return { preventDefault: true };
      }
      return { preventDefault: false };
    }
    if (activeCell && !editingCell && !isCtrl && key.length === 1) {
      this.core.edit.start(activeCell.row, activeCell.col);
    }
    return { preventDefault: false };
  }
}
