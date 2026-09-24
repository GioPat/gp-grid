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
  ColumnWindowSnapshot,
  DragState,
  FillHandlePosition,
  FilterPopupState,
  GridAnnouncement,
  HeaderData,
  GridCore,
  RowRegionLayout,
  SlotData,
} from '@gp-grid/core';
import type { ActiveFilterPopup, EditingCellState } from './components';

export interface GpGridViewModelDeps {
  getRows: () => unknown[];
  getRowHeight: () => number;
  /** Bound core, used for geometry queries (fill handle, peek anchoring). */
  getCore: () => GridCore<unknown> | null;
}

/** Pre-batch seed; the core publishes its own zero layout on the first batch. */
const EMPTY_ROW_REGIONS: RowRegionLayout = {
  frozenCount: 0,
  frozenExtent: 0,
  suffixViewportHeight: 0,
  frozen: { requestedCount: 0, effectiveCount: 0, limit: null },
};

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
  /** Physical direction used by header actions. */
  readonly rtl = signal<boolean>(false);
  /** DOM scroll offset (physical: negative in RTL); the header negates it. */
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
  /** C3 frozen/suffix layout published by the core. */
  readonly rowRegions = signal<RowRegionLayout>(EMPTY_ROW_REGIONS);
  /** C13 live-region text, or `null` when there is nothing to announce. */
  readonly announcement = signal<GridAnnouncement | null>(null);
  readonly slots = signal<Map<string, SlotData>>(new Map());
  readonly totalRows = signal<number>(0);
  /** Core-resolved displayed-column layout; null until the core publishes. */
  readonly layout = signal<ColumnLayoutSnapshot | null>(null);
  /** Center columns to mount at the committed geometry revision. */
  readonly columnWindow = signal<ColumnWindowSnapshot | null>(null);
  /** Displayed column count, for `aria-colcount`. */
  readonly displayedColumnCount = computed(() => this.layout()?.columns.length ?? 0);
  /** Selected displayed-width policy, mirrored from the core. */
  readonly columnLayout = signal<ColumnLayoutMode>('fit');
  /** Last committed geometry revision, for change detection. */
  readonly geometryRevision = signal<number>(0);
  readonly pendingScrollLeft = signal<number | null>(null);

  readonly effectiveColumns: Signal<ColumnDefinition[]>;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  readonly displayedIndexOf: Signal<(columnId: string) => number>;
  readonly totalWidth: Signal<number>;
  readonly fillHandlePosition: Signal<FillHandlePosition | null>;
  readonly slotsArray: Signal<SlotData[]>;
  /** C7: the slot partition the body renders, split by `slot.region`. */
  readonly frozenSlots: Signal<SlotData[]>;
  readonly suffixSlots: Signal<SlotData[]>;
  /** Height of the sticky frozen band. */
  readonly frozenHeight: Signal<number>;
  /**
   * One-element list, so `@for`'s track key remounts the live region on a new
   * revision and a repeated message is read again.
   */
  readonly announcements: Signal<GridAnnouncement[]>;
  readonly batchSetters: BatchChangeSetters;

  private filterAnchorEl: HTMLElement | null = null;

  constructor(deps: GpGridViewModelDeps) {
    this.effectiveColumns = computed(() => this.columns());
    // Keyed on the layout, so scrolling the window never rebuilds the index.
    this.displayedIndexOf = computed(() => {
      const index = new Map<string, number>();
      (this.layout()?.columns ?? []).forEach((column, at) => index.set(column.columnId, at));
      return (columnId: string): number => index.get(columnId) ?? 0;
    });
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
    this.frozenSlots = computed(() =>
      this.slotsArray().filter((slot) => slot.region === 'frozen'));
    this.suffixSlots = computed(() =>
      this.slotsArray().filter((slot) => slot.region === 'suffix'));
    this.frozenHeight = computed(() => this.rowRegions().frozenExtent);
    this.announcements = computed(() => {
      const announcement = this.announcement();
      return announcement === null ? [] : [announcement];
    });

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
      setColumnWindow: (v) => this.columnWindow.set(v),
      setColumnLayout: (v) => this.columnLayout.set(v),
      setRowRegions: (v) => this.rowRegions.set(v),
      setAnnouncement: (v) => this.announcement.set(v),
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
