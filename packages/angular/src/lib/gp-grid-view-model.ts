import { Signal, computed, signal } from '@angular/core';
import {
  calculateFillHandlePosition,
  calculateScaledColumnPositions,
  getTotalWidth,
} from '@gp-grid/core';
import type {
  BatchChangeSetters,
  CellPosition,
  CellRange,
  ColumnDefinition,
  DragState,
  FillHandlePosition,
  FilterPopupState,
  HeaderData,
  SlotData,
  VisibleColumnInfo,
} from '@gp-grid/core';
import type { ActiveFilterPopup, EditingCellState } from './components';
import type { AngularColumnDefinition } from './types';

export interface GpGridViewModelDeps {
  getColumns: () => AngularColumnDefinition[];
  getRows: () => unknown[];
  getRowHeight: () => number;
}

const INITIAL_DRAG_STATE: DragState = {
  isDragging: false,
  dragType: null,
  fillSourceRange: null,
  fillTarget: null,
  columnResize: null,
  columnMove: null,
  rowDrag: null,
};

/**
 * Reactive view-state container for GpGridComponent.
 *
 * Owns every signal and computed the template binds against, plus the
 * batch-change setters bag wired into those signals. The component
 * becomes a thin shell that holds lifecycle, event handlers, and inputs.
 *
 * Angular-specific (uses signal/computed from @angular/core) — lives in
 * the angular package, not core.
 */
export class GpGridViewModel {
  readonly headerState = signal<Map<number, HeaderData>>(new Map());
  readonly viewportWidth = signal<number>(0);
  readonly scrollLeft = signal<number>(0);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly filterPopup = signal<ActiveFilterPopup | null>(null);
  readonly pendingScrollTop = signal<number | null>(null);
  readonly activeCell = signal<CellPosition | null>(null);
  readonly selectionRange = signal<CellRange | null>(null);
  readonly editingCell = signal<EditingCellState | null>(null);
  readonly hoverPosition = signal<CellPosition | null>(null);
  readonly columnsOverride = signal<ColumnDefinition[] | null>(null);
  readonly dragState = signal<DragState>(INITIAL_DRAG_STATE);
  readonly contentWidth = signal<number>(0);
  readonly contentHeight = signal<number>(0);
  readonly rowsWrapperOffset = signal<number>(0);
  readonly slots = signal<Map<string, SlotData>>(new Map());

  readonly effectiveColumns: Signal<ColumnDefinition[]>;
  readonly visibleColumnWithIndices: Signal<VisibleColumnInfo[]>;
  readonly columnPositions: Signal<number[]>;
  readonly columnWidths: Signal<number[]>;
  readonly totalWidth: Signal<number>;
  readonly fillHandlePosition: Signal<FillHandlePosition | null>;
  readonly slotsArray: Signal<SlotData[]>;
  readonly totalRows: Signal<number>;

  readonly batchSetters: BatchChangeSetters;

  private filterAnchorEl: HTMLElement | null = null;

  constructor(deps: GpGridViewModelDeps) {
    this.effectiveColumns = computed(() =>
      this.columnsOverride() ?? (deps.getColumns() as unknown as ColumnDefinition[])
    );
    this.visibleColumnWithIndices = computed(() =>
      this.effectiveColumns()
        .map((col, index) => ({ column: col, originalIndex: index }))
        .filter(({ column }) => !column.hidden)
    );
    const columnLayout = computed(() =>
      calculateScaledColumnPositions(
        this.visibleColumnWithIndices().map(v => v.column),
        this.viewportWidth(),
      )
    );
    this.columnPositions = computed(() => columnLayout().positions);
    this.columnWidths = computed(() => columnLayout().widths);
    this.totalWidth = computed(() => getTotalWidth(this.columnPositions()));
    this.fillHandlePosition = computed(() =>
      calculateFillHandlePosition({
        activeCell: this.activeCell(),
        selectionRange: this.selectionRange(),
        slots: this.slots(),
        columns: this.effectiveColumns(),
        visibleColumnsWithIndices: this.visibleColumnWithIndices(),
        columnPositions: this.columnPositions(),
        columnWidths: this.columnWidths(),
        rowHeight: deps.getRowHeight(),
      })
    );
    this.slotsArray = computed(() => [...this.slots().values()]);
    this.totalRows = computed(() => deps.getRows().length);

    this.batchSetters = {
      setContentWidth: (v) => this.contentWidth.set(v),
      setContentHeight: (v) => this.contentHeight.set(v),
      setRowsWrapperOffset: (v) => this.rowsWrapperOffset.set(v),
      setIsLoading: (v) => this.isLoading.set(v),
      setErrorMessage: (v) => this.errorMessage.set(v),
      setPendingScrollTop: (v) => this.pendingScrollTop.set(v),
      setActiveCell: (v) => this.activeCell.set(v),
      setSelectionRange: (v) => this.selectionRange.set(v),
      setEditingCell: (v) => this.editingCell.set(v),
      setHoverPosition: (v) => this.hoverPosition.set(v),
      setColumnsOverride: (v) => this.columnsOverride.set(v),
      onFilterPopupChange: (v) => this.materializeFilterPopup(v),
    };
  }

  setFilterAnchor(el: HTMLElement | null): void {
    this.filterAnchorEl = el;
  }

  private materializeFilterPopup(state: FilterPopupState | null): void {
    if (state === null) {
      this.filterPopup.set(null);
      return;
    }
    if (state.isOpen && state.column) {
      this.filterPopup.set({
        colIndex: state.colIndex,
        column: state.column,
        distinctValues: state.distinctValues,
        currentFilter: state.currentFilter,
        anchorEl: this.filterAnchorEl,
      });
    }
  }
}
