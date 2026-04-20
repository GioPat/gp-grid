import type { GridCore } from "../grid-core";
import type { CellPosition } from "../types/basic";
import type { KeyEventData, KeyboardResult } from "../types/input";
import type { Direction } from "../selection";

const keyToDirection = (key: string): Direction | null => {
  switch (key) {
    case "ArrowUp": return "up";
    case "ArrowDown": return "down";
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    default: return null;
  }
};

type EditingCell = { row: number; col: number } | null;

export class KeyboardHandler<TData = unknown> {
  private readonly core: GridCore<TData>;

  constructor(core: GridCore<TData>) {
    this.core = core;
  }

  handle(
    event: KeyEventData,
    activeCell: CellPosition | null,
    editingCell: EditingCell,
    filterPopupOpen: boolean,
  ): KeyboardResult {
    if (filterPopupOpen) return { preventDefault: false };

    const editingAndNotSpecialKey =
      editingCell !== null &&
      event.key !== "Enter" &&
      event.key !== "Escape" &&
      event.key !== "Tab";
    if (editingAndNotSpecialKey) return { preventDefault: false };

    const direction = keyToDirection(event.key);
    if (direction !== null) return this.moveFocus(direction, event.shiftKey);

    const isCtrl = event.ctrlKey || event.metaKey;
    return this.handleAction(event.key, activeCell, editingCell, event.shiftKey, isCtrl);
  }

  private moveFocus(direction: Direction, isShift: boolean): KeyboardResult {
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
    if (editingCell) this.core.commitEdit();
    else if (activeCell) this.core.startEdit(activeCell.row, activeCell.col);
    return { preventDefault: true };
  }

  private handleEscape(editingCell: EditingCell): KeyboardResult {
    if (editingCell) this.core.cancelEdit();
    else this.core.selection.clearSelection();
    return { preventDefault: true };
  }

  private handleTab(editingCell: EditingCell, isShift: boolean): KeyboardResult {
    if (editingCell) this.core.commitEdit();
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
        this.core.startEdit(activeCell.row, activeCell.col);
      }
      return { preventDefault: true };
    }
    if (key === "Delete" || key === "Backspace") {
      if (activeCell && !editingCell) {
        this.core.startEdit(activeCell.row, activeCell.col);
        return { preventDefault: true };
      }
      return { preventDefault: false };
    }
    if (activeCell && !editingCell && !isCtrl && key.length === 1) {
      this.core.startEdit(activeCell.row, activeCell.col);
    }
    return { preventDefault: false };
  }
}
