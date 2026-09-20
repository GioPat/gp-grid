import { Signal, computed, signal } from '@angular/core';
import {
  calculateFillHandlePosition,
} from '@gp-grid/core';
import type {
  BatchChangeSetters,
  CellPosition,
  CellRange,
  ColumnDefinition,
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  DisplayedColumn,
  DragState,
  FillHandlePosition,
  FilterPopupState,
  HeaderData,
  GridCore,
  SlotData,
} from '@gp-grid/core';
import type { ActiveFilterPopup, EditingCellState } from './components';

export interface GpGridViewModelDeps {
  getRows: () => unknown[];
  getRowHeight: () => number;
  /** Bound core, used for geometry queries (fill handle, peek anchoring). */
  getCore: () => GridCore<unknown> | null;
}

const EMPTY_LAYOUT_COLUMNS: readonly DisplayedColumn[] = [];

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
  readonly headerState = signal<Map<string, HeaderData>>(new Map());
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
  readonly peekCell = signal<CellPosition | null>(null);
  /** Resolved layout owned by the core; never copied from the columns input. */
  readonly columns = signal<ColumnDefinition[]>([]);
  readonly dragState = signal<DragState>(INITIAL_DRAG_STATE);
  readonly contentWidth = signal<number>(0);
  readonly contentHeight = signal<number>(0);
  readonly rowsWrapperOffset = signal<number>(0);
  readonly slots = signal<Map<string, SlotData>>(new Map());
  readonly totalRows = signal<number>(0);
  /** Core-resolved displayed-column layout; null until the core publishes. */
  readonly layout = signal<ColumnLayoutSnapshot | null>(null);
  /** Selected displayed-width policy, mirrored from the core. */
  readonly columnLayout = signal<ColumnLayoutMode>('fit');
  /** Last committed geometry revision, for change detection. */
  readonly geometryRevision = signal<number>(0);
  readonly pendingScrollLeft = signal<number | null>(null);

  readonly effectiveColumns: Signal<ColumnDefinition[]>;
  /** Displayed columns, resolved by the core; empty until it publishes. */
  readonly layoutColumns: Signal<readonly DisplayedColumn[]>;
  readonly totalWidth: Signal<number>;
  readonly fillHandlePosition: Signal<FillHandlePosition | null>;
  readonly slotsArray: Signal<SlotData[]>;
  readonly batchSetters: BatchChangeSetters;

  private filterAnchorEl: HTMLElement | null = null;

  constructor(deps: GpGridViewModelDeps) {
    this.effectiveColumns = computed(() => this.columns());
    this.layoutColumns = computed(() => this.layout()?.columns ?? EMPTY_LAYOUT_COLUMNS);
    this.totalWidth = computed(() => this.contentWidth());
    this.fillHandlePosition = computed(() => {
      // Slots are replaced on every batch (row recycling, scrolling); the
      // revision covers geometry changes. Neither is read by the helper.
      this.slots();
      this.geometryRevision();
      const core = deps.getCore();
      if (core === null) return null;
      return calculateFillHandlePosition({
        core: core as GridCore<unknown>,
        activeCell: this.activeCell(),
        selectionRange: this.selectionRange(),
      });
    });
    this.slotsArray = computed(() => [...this.slots().values()]);

    this.batchSetters = {
      setContentWidth: (v) => this.contentWidth.set(v),
      setContentHeight: (v) => this.contentHeight.set(v),
      setRowsWrapperOffset: (v) => this.rowsWrapperOffset.set(v),
      setIsLoading: (v) => this.isLoading.set(v),
      setErrorMessage: (v) => this.errorMessage.set(v),
      setTotalRows: (v) => this.totalRows.set(v),
      setPendingScrollTop: (v) => this.pendingScrollTop.set(v),
      setPendingScrollLeft: (v) => this.pendingScrollLeft.set(v),
      setActiveCell: (v) => this.activeCell.set(v),
      setSelectionRange: (v) => this.selectionRange.set(v),
      setEditingCell: (v) => this.editingCell.set(v),
      setHoverPosition: (v) => this.hoverPosition.set(v),
      setPeekCell: (v) => this.peekCell.set(v),
      setColumns: (v) => this.columns.set(v),
      setLayout: (v) => this.layout.set(v),
      setColumnLayout: (v) => this.columnLayout.set(v),
      setGeometryRevision: (v) => this.geometryRevision.set(v),
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
