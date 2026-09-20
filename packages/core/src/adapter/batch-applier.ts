import type { CellValue, CellPosition, CellRange } from "../types/basic";
import type { ColumnDefinition } from "../types/columns";
import type { ColumnLayoutMode, ColumnLayoutSnapshot } from "../types/geometry";
import type { GridInstruction } from "../types/instructions";
import type { FilterPopupState, HeaderData, SlotData } from "../types/ui-state";
import { applyInstruction } from "../state-reducer";

type EditingCell = { row: number; col: number; initialValue: CellValue; editId: number } | null;

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
  setTotalRows: (v: number) => void;
  setPendingScrollTop: (v: number | null) => void;
  setPendingScrollLeft: (v: number | null) => void;
  setActiveCell: (v: CellPosition | null) => void;
  setSelectionRange: (v: CellRange | null) => void;
  setEditingCell: (v: EditingCell) => void;
  setHoverPosition: (v: CellPosition | null) => void;
  setPeekCell: (v: CellPosition | null) => void;
  setColumns: (v: ColumnDefinition[]) => void;
  /** Resolved displayed-column layout at the committed geometry revision. */
  setLayout?: (v: ColumnLayoutSnapshot) => void;
  /** Selected column layout mode, mirrored from the core. */
  setColumnLayout?: (v: ColumnLayoutMode) => void;
  /** Committed geometry revision, for wrapper-side change detection. */
  setGeometryRevision?: (v: number) => void;
  onFilterPopupChange: (v: FilterPopupState | null) => void;
}

type MutableMaps = {
  slots: Map<string, SlotData>;
  headers: Map<string, HeaderData>;
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
  currentHeaders: Map<string, HeaderData>,
  setters: BatchChangeSetters,
): MutableMaps => {
  const maps: MutableMaps = {
    slots: new Map(currentSlots),
    headers: new Map(currentHeaders),
  };
  for (const instruction of instructions) {
    // Slot and header instructions mutate the maps in place and answer null.
    const changes = applyInstruction(instruction, maps.slots, maps.headers);
    if (changes === null) continue;
    applyPartialState(changes, setters);
  }
  return maps;
};

const applyPartialState = (
  changes: NonNullable<ReturnType<typeof applyInstruction>>,
  setters: BatchChangeSetters,
): void => {
  applyScalarState(changes, setters);
  if (changes.columns !== undefined) {
    setters.setColumns(changes.columns);
  }
  if (changes.layout !== undefined && changes.layout !== null) {
    setters.setLayout?.(changes.layout);
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
  if (changes.totalRows !== undefined) setters.setTotalRows(changes.totalRows);
  if (changes.pendingScrollTop !== undefined) setters.setPendingScrollTop(changes.pendingScrollTop);
  if (changes.pendingScrollLeft !== undefined) setters.setPendingScrollLeft(changes.pendingScrollLeft);
  if (changes.geometryRevision !== undefined) setters.setGeometryRevision?.(changes.geometryRevision);
  if (changes.activeCell !== undefined) setters.setActiveCell(changes.activeCell);
  if (changes.selectionRange !== undefined) setters.setSelectionRange(changes.selectionRange);
  if (changes.editingCell !== undefined) setters.setEditingCell(changes.editingCell);
  if (changes.hoverPosition !== undefined) setters.setHoverPosition(changes.hoverPosition);
  if (changes.peekCell !== undefined) setters.setPeekCell(changes.peekCell);
};
