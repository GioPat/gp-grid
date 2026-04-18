import {
  Component,
  ElementRef,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ChangeDetectionStrategy,
  PLATFORM_ID,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
} from '@angular/core';
import type { CellRendererTemplate, EditRendererTemplate, HeaderRendererTemplate, HeaderSortEvent } from './components';
import type { AngularColumnDefinition } from './types';
import { isPlatformBrowser } from '@angular/common';
import {
  GridCore,
  calculateScaledColumnPositions,
  calculateFillHandlePosition,
  getTotalWidth,
  createDataSourceFromArray,
  scrollCellIntoView,
} from '@gp-grid/core';
import type {
  ColumnDefinition,
  HeaderData,
  VisibleColumnInfo,
  DataSource,
  CellValueChangedEvent,
  ColumnFilterModel,
  DragState,
  CellPosition,
  CellRange,
  FillHandlePosition,
  HighlightingOptions,
  RowId,
  SlotData,
  FilterPopupState,
} from '@gp-grid/core';
import {
  GridHeaderComponent,
  GridBodyComponent,
  GridOverlaysComponent,
} from './components';
import type { ActiveFilterPopup } from './components';
import type {
  HeaderPointerDownEvent,
  FilterPointerDownEvent,
  ResizePointerDownEvent,
  CellPointerDownEvent,
  CellPointerEnterEvent,
  CellDoubleClickEvent,
  EditingCellState,
  FillHandlePointerDownEvent,
} from './components';
import { toPointerEventData } from './utils/pointer-event';
import { AutoScrollDriver } from './helpers/auto-scroll';
import { PendingRowDragController } from './helpers/pending-row-drag';
import { applyBatchInstructions } from './helpers/apply-batch-changes';
import { GP_GRID_TEMPLATE } from './gp-grid.template';

@Component({
  selector: 'gp-grid',
  standalone: true,
  imports: [GridHeaderComponent, GridBodyComponent, GridOverlaysComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; height: 100%; min-height: 0; }`],
  template: GP_GRID_TEMPLATE,
})
export class GpGridComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;
  @ViewChild(GridBodyComponent) body!: GridBodyComponent;

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  columns = input.required<AngularColumnDefinition[]>();
  rows = input<unknown[]>([]);
  dataSource = input<DataSource<unknown> | null>(null);
  getRowId = input<((row: unknown) => RowId) | null>(null);
  rowHeight = input<number>(32);
  headerHeight = input<number>(32);
  darkMode = input<boolean>(false);
  cellRenderers = input<Record<string, CellRendererTemplate>>({});
  headerRenderers = input<Record<string, HeaderRendererTemplate>>({});
  editRenderers = input<Record<string, EditRendererTemplate>>({});
  cellRenderer = input<CellRendererTemplate | null>(null);
  headerRenderer = input<HeaderRendererTemplate | null>(null);
  editRenderer = input<EditRendererTemplate | null>(null);
  highlighting = input<HighlightingOptions | null>(null);
  rowDragEntireRow = input<boolean>(false);
  overscan = input<number>(3);
  sortingEnabled = input<boolean>(true);
  wheelDampening = input<number>(0.1);
  onRowDragEnd = output<{ source: number; target: number }>();
  onCellValueChanged = output<CellValueChangedEvent<unknown>>();
  onColumnResized = output<{ colIndex: number; newWidth: number }>();
  onColumnMoved = output<{ fromIndex: number; toIndex: number }>();

  private coreRef: GridCore<unknown> | null = null;
  private ownedDataSource: DataSource<unknown> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private filterAnchorEl: HTMLElement | null = null;
  private lastAppliedColumns: AngularColumnDefinition[] | null = null;
  private lastAppliedRows: unknown[] | null = null;
  private readonly autoScroll = new AutoScrollDriver(
    () => this.body?.scrollContainer?.nativeElement ?? null,
    (event) => this.processDragMove(event),
  );
  private readonly pendingRowDrag = new PendingRowDragController({
    getCore: () => this.coreRef,
    getContainer: () => this.container?.nativeElement ?? null,
    isBrowser: this.isBrowser,
    onDragConfirmed: (state) => this.dragState.set(state),
  });

  protected headerState = signal<Map<number, HeaderData>>(new Map());
  protected viewportWidth = signal<number>(0);
  protected scrollLeft = signal<number>(0);
  protected isLoading = signal<boolean>(false);
  protected errorMessage = signal<string | null>(null);
  protected filterPopup = signal<ActiveFilterPopup | null>(null);
  protected pendingScrollTop = signal<number | null>(null);
  protected activeCell = signal<CellPosition | null>(null);
  protected selectionRange = signal<CellRange | null>(null);
  protected editingCell = signal<EditingCellState | null>(null);
  protected hoverPosition = signal<CellPosition | null>(null);
  private columnsOverride = signal<ColumnDefinition[] | null>(null);
  protected dragState = signal<DragState>({
    isDragging: false,
    dragType: null,
    fillSourceRange: null,
    fillTarget: null,
    columnResize: null,
    columnMove: null,
    rowDrag: null,
  });

  protected effectiveColumns = computed<ColumnDefinition[]>(() =>
    this.columnsOverride() ?? (this.columns() as unknown as ColumnDefinition[])
  );

  protected visibleColumnWithIndices = computed<VisibleColumnInfo[]>(() =>
    this.effectiveColumns()
      .map((col, index) => ({ column: col, originalIndex: index }))
      .filter(({ column }) => !column.hidden)
  );

  private columnLayout = computed(() =>
    calculateScaledColumnPositions(
      this.visibleColumnWithIndices().map(v => v.column),
      this.viewportWidth(),
    )
  );

  protected columnPositions = computed(() => this.columnLayout().positions);
  protected columnWidths = computed(() => this.columnLayout().widths);
  protected totalWidth = computed(() => getTotalWidth(this.columnPositions()));
  protected contentWidth = signal<number>(0);

  protected fillHandlePosition = computed<FillHandlePosition | null>(() =>
    calculateFillHandlePosition({
      activeCell: this.activeCell(),
      selectionRange: this.selectionRange(),
      slots: this.slots(),
      columns: this.effectiveColumns(),
      visibleColumnsWithIndices: this.visibleColumnWithIndices(),
      columnPositions: this.columnPositions(),
      columnWidths: this.columnWidths(),
      rowHeight: this.rowHeight(),
    })
  );

  protected slots = signal<Map<string, SlotData>>(new Map());
  protected slotsArray = computed(() => [...this.slots().values()]);
  protected contentHeight = signal<number>(0);
  protected rowsWrapperOffset = signal<number>(0);
  protected totalRows = computed(() => this.rows().length);

  constructor() {
    effect(() => this.applyPendingScroll());
    effect(() => this.syncHighlightingToCore());
    effect(() => this.syncColumnsToCore());
    effect(() => this.syncRowsToCore());
  }

  ngOnInit(): void {
    this.coreRef = this.buildGridCore();
    this.unsubscribe = this.coreRef.onBatchInstruction((instructions) => {
      const maps = applyBatchInstructions(
        instructions,
        this.slots(),
        this.headerState(),
        this.batchSetters,
      );
      this.slots.set(new Map(maps.slots));
      this.headerState.set(new Map(maps.headers));
    });

    this.coreRef.initialize();

    this.coreRef.input.updateDeps({
      getHeaderHeight: () => this.headerHeight(),
      getRowHeight: () => this.rowHeight(),
      getColumnPositions: () => this.columnPositions(),
      getColumnCount: () => this.visibleColumnWithIndices().length,
      getOriginalColumnIndex: (visibleIndex: number) =>
        this.visibleColumnWithIndices()[visibleIndex]?.originalIndex ?? visibleIndex,
    });
  }

  ngAfterViewInit(): void {
    if (this.isBrowser === false) return;

    const element = this.container.nativeElement;
    const bodyEl = this.body.scrollContainer.nativeElement;
    this.viewportWidth.set(element.clientWidth);
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) this.viewportWidth.set(entry.contentRect.width);
    });
    this.resizeObserver.observe(element);
    this.coreRef?.setViewport(0, 0, element.clientWidth, bodyEl.clientHeight);

    document.addEventListener('pointermove', this.onDocumentPointerMove, { passive: false });
    document.addEventListener('pointerup', this.onDocumentPointerUp);
  }

  ngOnDestroy(): void {
    this.autoScroll.stop();
    this.pendingRowDrag.cancel();
    this.pendingRowDrag.releaseLocks();
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    this.coreRef?.destroy();
    this.ownedDataSource?.destroy?.();
    this.coreRef = null;
    this.ownedDataSource = null;

    if (this.isBrowser) {
      document.removeEventListener('pointermove', this.onDocumentPointerMove);
      document.removeEventListener('pointerup', this.onDocumentPointerUp);
    }
  }

  protected onBodyScroll(scrollLeft: number): void {
    this.scrollLeft.set(scrollLeft);
    const el = this.body.scrollContainer.nativeElement;
    this.coreRef?.setViewport(el.scrollTop, scrollLeft, el.clientWidth, el.clientHeight);
  }

  protected onHeaderPointerDown(evt: HeaderPointerDownEvent): void {
    const result = this.coreRef?.input.handleHeaderMouseDown(
      evt.colIndex,
      evt.colWidth,
      evt.colHeight,
      toPointerEventData(evt.event),
    );
    if (result?.preventDefault) evt.event.preventDefault();
  }

  protected onFilterPointerDown(evt: FilterPointerDownEvent): void {
    this.filterAnchorEl = evt.anchorEl;
    const rect = evt.anchorEl.getBoundingClientRect();
    this.coreRef?.openFilterPopup(evt.colIndex, {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }

  protected onCellPointerDown(evt: CellPointerDownEvent): void {
    const core = this.coreRef;
    if (core === null) return;
    const result = core.input.handleCellMouseDown(
      evt.rowIndex,
      evt.colIndex,
      toPointerEventData(evt.event),
    );
    if (result.preventDefault) evt.event.preventDefault();
    if (result.focusContainer) {
      this.container.nativeElement.focus({ preventScroll: true });
    }
    this.handleCellDragStart(result.startDrag, evt.event);
  }

  private handleCellDragStart(
    startDrag: string | null | undefined,
    event: PointerEvent,
  ): void {
    const core = this.coreRef;
    if (core === null || !startDrag) return;
    if (startDrag === 'selection') {
      core.input.startSelectionDrag();
      this.dragState.set(core.input.getDragState());
    } else if (startDrag === 'row-drag') {
      this.dragState.set(core.input.getDragState());
    } else if (startDrag === 'row-drag-pending') {
      this.pendingRowDrag.start(event);
    }
  }

  protected onCellPointerEnter(evt: CellPointerEnterEvent): void {
    this.coreRef?.input.handleCellMouseEnter(evt.rowIndex, evt.colIndex);
  }

  protected onFillHandlePointerDown(evt: FillHandlePointerDownEvent): void {
    const core = this.coreRef;
    if (core === null) return;
    const result = core.input.handleFillHandleMouseDown(
      this.activeCell(),
      this.selectionRange(),
      toPointerEventData(evt.event),
    );
    if (result.preventDefault) evt.event.preventDefault();
    if (result.stopPropagation) evt.event.stopPropagation();
    if (result.startDrag === 'fill') {
      capturePointer(evt.event);
      this.dragState.set(core.input.getDragState());
    }
  }

  protected onCellPointerLeave(): void {
    this.coreRef?.input.handleCellMouseLeave();
  }

  protected computeRowClassesFn = (rowIndex: number, rowData: unknown): string[] => {
    return this.coreRef?.highlight?.computeRowClasses(rowIndex, rowData) ?? [];
  };

  protected computeCellClassesFn = (
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData: unknown,
  ): string[] => {
    return this.coreRef?.highlight?.computeCombinedCellClasses(
      rowIndex,
      colIndex,
      column,
      rowData,
    ) ?? [];
  };

  protected onCellDoubleClick(evt: CellDoubleClickEvent): void {
    this.coreRef?.startEdit(evt.rowIndex, evt.colIndex);
  }

  protected onEditValueChange(value: string): void {
    this.coreRef?.updateEditValue(value);
  }

  protected onEditCommit(): void {
    this.coreRef?.commitEdit();
  }

  protected onEditCancel(): void {
    this.coreRef?.cancelEdit();
  }

  protected onHeaderSort(evt: HeaderSortEvent): void {
    this.coreRef?.setSort(evt.colId, evt.direction, evt.addToExisting);
  }

  protected onWheel(event: WheelEvent): void {
    const core = this.coreRef;
    const bodyEl = this.body?.scrollContainer?.nativeElement;
    if (core === null || !bodyEl) return;
    const dampened = core.input.handleWheel(event.deltaY, event.deltaX, this.wheelDampening());
    if (dampened) {
      event.preventDefault();
      bodyEl.scrollTop += dampened.dy;
      bodyEl.scrollLeft += dampened.dx;
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const core = this.coreRef;
    if (core === null) return;
    const editing = this.editingCell();
    const result = core.input.handleKeyDown(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      },
      this.activeCell(),
      editing === null ? null : { row: editing.row, col: editing.col },
      this.filterPopup() !== null,
    );
    if (result.preventDefault) event.preventDefault();
    if (result.scrollToCell) this.scrollToRow(result.scrollToCell.row);
  }

  private scrollToRow(row: number): void {
    const core = this.coreRef;
    const container = this.body?.scrollContainer?.nativeElement;
    if (core === null || !container) return;
    scrollCellIntoView(
      core,
      container,
      row,
      this.rowHeight(),
      this.slots(),
      this.rowsWrapperOffset(),
    );
  }

  protected onResizePointerDown(evt: ResizePointerDownEvent): void {
    const result = this.coreRef?.input.handleHeaderResizeMouseDown(
      evt.colIndex,
      evt.colWidth,
      toPointerEventData(evt.event),
    );
    if (result?.preventDefault) evt.event.preventDefault();
  }

  protected onFilterApply(event: { colId: string; filter: ColumnFilterModel | null }): void {
    this.coreRef?.setFilter(event.colId, event.filter);
    this.filterPopup.set(null);
  }

  protected onFilterClose(): void {
    this.coreRef?.closeFilterPopup();
    this.filterPopup.set(null);
  }

  private processDragMove(event: PointerEvent): void {
    const core = this.coreRef;
    const bodyEl = this.body?.scrollContainer?.nativeElement;
    if (core === null || !bodyEl) return;
    const rect = bodyEl.getBoundingClientRect();
    const result = core.input.handleDragMove(toPointerEventData(event), {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      scrollTop: bodyEl.scrollTop,
      scrollLeft: bodyEl.scrollLeft,
    });
    this.dragState.set(core.input.getDragState());
    if (result?.autoScroll) {
      this.autoScroll.start(result.autoScroll.dx, result.autoScroll.dy);
    } else {
      this.autoScroll.stop();
    }
  }

  private onDocumentPointerMove = (event: PointerEvent): void => {
    const core = this.coreRef;
    if (core === null) return;
    if (core.input.getDragState().isDragging) event.preventDefault();
    this.autoScroll.recordPointer(event);
    this.processDragMove(event);
  };

  private onDocumentPointerUp = (_event: PointerEvent): void => {
    const core = this.coreRef;
    if (core === null) return;
    const wasRowDrag = core.input.getDragState().dragType === 'row-drag';
    this.autoScroll.stop();
    this.autoScroll.clearPointer();
    core.input.handleDragEnd();
    this.dragState.set(core.input.getDragState());
    if (wasRowDrag) this.pendingRowDrag.releaseLocks();
  };

  private applyPendingScroll(): void {
    const top = this.pendingScrollTop();
    if (top !== null && this.body?.scrollContainer) {
      this.body.scrollContainer.nativeElement.scrollTop = top;
      this.pendingScrollTop.set(null);
    }
  }

  private syncHighlightingToCore(): void {
    const opts = this.highlighting();
    const core = this.coreRef;
    if (core?.highlight && opts) {
      core.highlight.updateOptions(opts as HighlightingOptions<unknown>);
    }
  }

  private syncColumnsToCore(): void {
    const cols = this.columns();
    const core = this.coreRef;
    if (core === null || cols.length === 0) return;
    if (this.lastAppliedColumns === cols) return;
    this.lastAppliedColumns = cols;
    core.setColumns(cols as unknown as ColumnDefinition[]);
  }

  private syncRowsToCore(): void {
    const rows = this.rows();
    const provided = this.dataSource();
    const core = this.coreRef;
    if (core === null || provided !== null) return;
    if (this.lastAppliedRows === rows) return;
    this.lastAppliedRows = rows;
    if (rows.length > 10_000) {
      console.warn(
        `[gp-grid] rows input changed with ${rows.length} rows — this triggers a full rebuild. Use createGridData() for efficient updates.`,
      );
    }
    this.ownedDataSource?.destroy?.();
    this.ownedDataSource = createDataSourceFromArray(rows);
    core.setDataSource(this.ownedDataSource);
  }

  private buildGridCore(): GridCore<unknown> {
    const provided = this.dataSource();
    const initialRows = this.rows();
    if (provided === null) {
      this.ownedDataSource = createDataSourceFromArray(initialRows);
      this.lastAppliedRows = initialRows;
    }
    const activeDataSource = provided ?? this.ownedDataSource!;
    const getRowId = this.getRowId() ?? undefined;
    return new GridCore<unknown>({
      columns: this.columns() as unknown as ColumnDefinition[],
      dataSource: activeDataSource,
      rowHeight: this.rowHeight(),
      headerHeight: this.headerHeight(),
      overscan: this.overscan(),
      sortingEnabled: this.sortingEnabled(),
      highlighting: (this.highlighting() ?? undefined) as HighlightingOptions<unknown> | undefined,
      getRowId,
      rowDragEntireRow: this.rowDragEntireRow(),
      onRowDragEnd: (source, target) => this.onRowDragEnd.emit({ source, target }),
      onCellValueChanged: getRowId === undefined
        ? undefined
        : (event) => this.onCellValueChanged.emit(event as CellValueChangedEvent<unknown>),
      onColumnResized: (colIndex, newWidth) =>
        this.onColumnResized.emit({ colIndex, newWidth }),
      onColumnMoved: (fromIndex, toIndex) =>
        this.onColumnMoved.emit({ fromIndex, toIndex }),
    });
  }

  private readonly batchSetters = {
    setContentWidth: (v: number) => this.contentWidth.set(v),
    setContentHeight: (v: number) => this.contentHeight.set(v),
    setRowsWrapperOffset: (v: number) => this.rowsWrapperOffset.set(v),
    setIsLoading: (v: boolean) => this.isLoading.set(v),
    setErrorMessage: (v: string | null) => this.errorMessage.set(v),
    setPendingScrollTop: (v: number | null) => this.pendingScrollTop.set(v),
    setActiveCell: (v: CellPosition | null) => this.activeCell.set(v),
    setSelectionRange: (v: CellRange | null) => this.selectionRange.set(v),
    setEditingCell: (v: EditingCellState | null) => this.editingCell.set(v),
    setHoverPosition: (v: CellPosition | null) => this.hoverPosition.set(v),
    setColumnsOverride: (v: ColumnDefinition[]) => this.columnsOverride.set(v),
    onFilterPopupChange: (v: FilterPopupState | null) => this.handleFilterPopupChange(v),
  };

  private handleFilterPopupChange(filterPopup: FilterPopupState | null): void {
    if (filterPopup === null) {
      this.filterPopup.set(null);
      return;
    }
    if (filterPopup.isOpen && filterPopup.column) {
      this.filterPopup.set({
        colIndex: filterPopup.colIndex,
        column: filterPopup.column,
        distinctValues: filterPopup.distinctValues,
        currentFilter: filterPopup.currentFilter,
        anchorEl: this.filterAnchorEl,
      });
    }
  }
}

const capturePointer = (event: PointerEvent): void => {
  try {
    (event.target as Element).setPointerCapture(event.pointerId);
  } catch (_) {
    /* pointer may have been released */
  }
};
