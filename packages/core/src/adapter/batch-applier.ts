import type { CellValue, CellPosition, CellRange } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { GridInstruction } from "../types/instructions";
import type { FilterPopupState, HeaderData, SlotData } from "../types/ui-state";
import { applyInstruction } from "../state-reducer";

type EditingCell = { row: number; col: number; initialValue: CellValue } | null;

/**
 * A "setters bag" the wrapper provides. Each setter pokes a framework-
 * specific reactive primitive (signal.set, ref.value =, dispatch action).
 * The batch applier itself is pure and reactivity-agnostic.
 */
export interface BatchChangeSetters {
  setContentWidth: (v: number) => void;
  setContentHeight: (v: number) => void;
  setRowsWrapperOffset: (v: number) => void;
  setIsLoading: (v: boolean) => void;
  setErrorMessage: (v: string | null) => void;
  setPendingScrollTop: (v: number | null) => void;
  setActiveCell: (v: CellPosition | null) => void;
  setSelectionRange: (v: CellRange | null) => void;
  setEditingCell: (v: EditingCell) => void;
  setHoverPosition: (v: CellPosition | null) => void;
  setColumnsOverride: (v: ColumnDefinition[]) => void;
  setTotalRows?: (v: number) => void;
  onFilterPopupChange: (v: FilterPopupState | null) => void;
}

type MutableMaps = {
  slots: Map<string, SlotData>;
  headers: Map<number, HeaderData>;
};

/**
 * Apply a batch of grid instructions to a snapshot of slots/headers while
 * dispatching scalar changes through the provided setters. Returns the
 * new slot/header maps so the wrapper can commit them to its reactive
 * containers in one step.
 */
export const applyBatchInstructions = (
  instructions: readonly GridInstruction[],
  currentSlots: Map<string, SlotData>,
  currentHeaders: Map<number, HeaderData>,
  setters: BatchChangeSetters,
): MutableMaps => {
  const maps: MutableMaps = {
    slots: new Map(currentSlots),
    headers: new Map(currentHeaders),
  };
  for (const instruction of instructions) {
    const changes = applyInstruction(instruction, maps.slots, maps.headers);
    if (changes === null) continue;
    applyPartialState(changes, maps, setters);
  }
  return maps;
};

const applyPartialState = (
  changes: NonNullable<ReturnType<typeof applyInstruction>>,
  maps: MutableMaps,
  setters: BatchChangeSetters,
): void => {
  if (changes.slots !== undefined) replaceMap(maps.slots, changes.slots);
  if (changes.headers !== undefined) replaceMap(maps.headers, changes.headers);
  applyScalarState(changes, setters);
  if (changes.columns !== undefined && changes.columns !== null) {
    setters.setColumnsOverride(changes.columns);
  }
  if (changes.filterPopup !== undefined) {
    setters.onFilterPopupChange(changes.filterPopup);
  }
};

const applyScalarState = (
  changes: NonNullable<ReturnType<typeof applyInstruction>>,
  setters: BatchChangeSetters,
): void => {
  if (changes.contentWidth !== undefined) setters.setContentWidth(changes.contentWidth);
  if (changes.contentHeight !== undefined) setters.setContentHeight(changes.contentHeight);
  if (changes.rowsWrapperOffset !== undefined) setters.setRowsWrapperOffset(changes.rowsWrapperOffset);
  if (changes.isLoading !== undefined) setters.setIsLoading(changes.isLoading);
  if (changes.error !== undefined) setters.setErrorMessage(changes.error);
  if (changes.pendingScrollTop !== undefined) setters.setPendingScrollTop(changes.pendingScrollTop);
  if (changes.activeCell !== undefined) setters.setActiveCell(changes.activeCell);
  if (changes.selectionRange !== undefined) setters.setSelectionRange(changes.selectionRange);
  if (changes.editingCell !== undefined) setters.setEditingCell(changes.editingCell);
  if (changes.hoverPosition !== undefined) setters.setHoverPosition(changes.hoverPosition);
  if (changes.totalRows !== undefined) setters.setTotalRows?.(changes.totalRows);
};

const replaceMap = <K, V>(target: Map<K, V>, source: Map<K, V>): void => {
  target.clear();
  source.forEach((v, k) => target.set(k, v));
};
