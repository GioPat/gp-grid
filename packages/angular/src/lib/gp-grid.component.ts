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
  effect,
} from '@angular/core';
import type { CellRendererTemplate, EditRendererTemplate, HeaderRendererTemplate, HeaderSortEvent } from './components';
import type { AngularColumnDefinition } from './types';
import { isPlatformBrowser } from '@angular/common';
import type {
  CellValueChangedEvent,
  ColumnDefinition,
  ColumnFilterModel,
  DataSource,
  HighlightingOptions,
  RowId,
  RowGroupingOptions,
} from '@gp-grid/core';
import {
  GridHeaderComponent,
  GridBodyComponent,
  GridOverlaysComponent,
} from './components';
import type {
  HeaderPointerDownEvent,
  FilterPointerDownEvent,
  ResizePointerDownEvent,
  CellPointerDownEvent,
  CellPointerEnterEvent,
  CellDoubleClickEvent,
  FillHandlePointerDownEvent,
} from './components';
import { GP_GRID_TEMPLATE } from './gp-grid.template';
import { GpGridViewModel } from './gp-grid-view-model';
import { GpGridBindings } from './gp-grid-bindings';
import { buildGridCore } from './gp-grid.factory';

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
  rowGrouping = input<RowGroupingOptions | null>(null);
  onRowGroupExpandedChange = output<{ groupKey: string; expanded: boolean }>();

  protected readonly vm = new GpGridViewModel({
    getColumns: () => this.columns(),
    getRows: () => this.rows(),
    getRowHeight: () => this.rowHeight(),
  });

  private readonly bindings = new GpGridBindings<unknown>({
    vm: this.vm,
    isBrowser: this.isBrowser,
    getContainer: () => this.container?.nativeElement ?? null,
    getBody: () => this.body?.scrollContainer?.nativeElement ?? null,
    getRowHeight: () => this.rowHeight(),
    getHeaderHeight: () => this.headerHeight(),
  });
  private syncScrollCssVars: (() => void) | null = null;

  constructor() {
    effect(() => this.bindings.applyPendingScroll(), { allowSignalWrites: true });
    effect(() => this.bindings.syncHighlighting(this.highlighting()));
    effect(() => this.bindings.syncRowGrouping(this.rowGrouping()));
    effect(() => this.bindings.syncColumns(this.columns() as unknown as ColumnDefinition[]), { allowSignalWrites: true });
    effect(() => this.bindings.syncRows(this.rows(), this.dataSource()), { allowSignalWrites: true });
  }

  ngOnInit(): void {
    const core = buildGridCore<unknown>(
      {
        columns: this.columns() as unknown as ColumnDefinition[],
        dataSource: this.bindings.dataSourceOwner.initialize(this.dataSource(), this.rows()),
        rowHeight: this.rowHeight(),
        headerHeight: this.headerHeight(),
        overscan: this.overscan(),
        sortingEnabled: this.sortingEnabled(),
        highlighting: (this.highlighting() ?? undefined) as HighlightingOptions<unknown> | undefined,
        getRowId: this.getRowId() ?? undefined,
        rowDragEntireRow: this.rowDragEntireRow(),
        rowGrouping: this.rowGrouping() ?? undefined,
      },
      {
        onRowDragEnd: (source, target) => this.onRowDragEnd.emit({ source, target }),
        onCellValueChanged: (event) => this.onCellValueChanged.emit(event),
        onColumnResized: (colIndex, newWidth) => this.onColumnResized.emit({ colIndex, newWidth }),
        onColumnMoved: (fromIndex, toIndex) => this.onColumnMoved.emit({ fromIndex, toIndex }),
        onRowGroupExpandedChange: (groupKey, expanded) =>
          this.onRowGroupExpandedChange.emit({ groupKey, expanded }),
      },
    );
    this.bindings.attach(core);
  }

  ngAfterViewInit(): void {
    if (this.isBrowser === false) return;
    const bodyEl = this.body.scrollContainer.nativeElement;
    this.syncScrollCssVars = (): void => {
      this.container.nativeElement.style.setProperty(
        '--gp-grid-scroll-left',
        `${bodyEl.scrollLeft}px`,
      );
    };
    this.bindings.observeViewport(
      this.container.nativeElement,
      bodyEl,
    );
    bodyEl.addEventListener('scroll', this.syncScrollCssVars, { passive: true });
    this.syncScrollCssVars();
    document.addEventListener('pointermove', this.onDocumentPointerMove, { passive: false });
    document.addEventListener('pointerup', this.onDocumentPointerUp);
  }

  ngOnDestroy(): void {
    this.bindings.destroy();
    if (this.isBrowser) {
      document.removeEventListener('pointermove', this.onDocumentPointerMove);
      document.removeEventListener('pointerup', this.onDocumentPointerUp);
      if (this.syncScrollCssVars !== null && this.body?.scrollContainer?.nativeElement) {
        this.body.scrollContainer.nativeElement.removeEventListener('scroll', this.syncScrollCssVars);
      }
    }
  }

  protected onBodyScroll(scrollLeft: number): void {
    this.container.nativeElement.style.setProperty('--gp-grid-scroll-left', `${scrollLeft}px`);
    this.vm.scrollLeft.set(scrollLeft);
    const el = this.body.scrollContainer.nativeElement;
    this.bindings.coreRef?.setViewport(el.scrollTop, scrollLeft, el.clientWidth, el.clientHeight);
  }

  protected onHeaderPointerDown(evt: HeaderPointerDownEvent): void {
    if (this.bindings.input.headerPointerDown(evt.colIndex, evt.colWidth, evt.colHeight, evt.event)) {
      evt.event.preventDefault();
    }
  }

  protected onFilterPointerDown(evt: FilterPointerDownEvent): void {
    this.vm.setFilterAnchor(evt.anchorEl);
    const rect = evt.anchorEl.getBoundingClientRect();
    this.bindings.coreRef?.openFilterPopup(evt.colIndex, {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }

  protected onCellPointerDown(evt: CellPointerDownEvent): void {
    const action = this.bindings.input.cellPointerDown(evt.rowIndex, evt.colIndex, evt.event);
    if (action.preventDefault) evt.event.preventDefault();
    if (action.focusContainer) {
      this.container.nativeElement.focus({ preventScroll: true });
    }
  }

  protected onCellPointerEnter(evt: CellPointerEnterEvent): void {
    this.bindings.input.cellPointerEnter(evt.rowIndex, evt.colIndex);
  }

  protected onFillHandlePointerDown(evt: FillHandlePointerDownEvent): void {
    const action = this.bindings.input.fillHandlePointerDown(
      this.vm.activeCell(),
      this.vm.selectionRange(),
      evt.event,
    );
    if (action.preventDefault) evt.event.preventDefault();
    if (action.stopPropagation) evt.event.stopPropagation();
  }

  protected onCellPointerLeave(): void {
    this.bindings.input.cellPointerLeave();
  }

  protected computeRowClassesFn = (rowIndex: number, rowData: unknown): string[] => {
    return this.bindings.coreRef?.highlight?.computeRowClasses(rowIndex, rowData) ?? [];
  };

  protected computeCellClassesFn = (
    rowIndex: number,
    colIndex: number,
    column: ColumnDefinition,
    rowData: unknown,
  ): string[] => {
    return this.bindings.coreRef?.highlight?.computeCombinedCellClasses(
      rowIndex,
      colIndex,
      column,
      rowData,
    ) ?? [];
  };

  protected onCellDoubleClick(evt: CellDoubleClickEvent): void {
    this.bindings.coreRef?.startEdit(evt.rowIndex, evt.colIndex);
  }

  protected onRowGroupToggle(groupKey: string): void {
    this.bindings.coreRef?.toggleRowGroup(groupKey);
  }

  protected onEditValueChange(value: string): void {
    this.bindings.coreRef?.updateEditValue(value);
  }

  protected onEditCommit(): void {
    this.bindings.coreRef?.commitEdit();
  }

  protected onEditCancel(): void {
    this.bindings.coreRef?.cancelEdit();
  }

  protected onHeaderSort(evt: HeaderSortEvent): void {
    this.bindings.coreRef?.setSort(evt.colId, evt.direction, evt.addToExisting);
  }

  protected onWheel(event: WheelEvent): void {
    const bodyEl = this.body?.scrollContainer?.nativeElement;
    if (!bodyEl) return;
    const dampened = this.bindings.input.wheel(event.deltaY, event.deltaX, this.wheelDampening());
    if (dampened) {
      event.preventDefault();
      bodyEl.scrollTop += dampened.dy;
      bodyEl.scrollLeft += dampened.dx;
    }
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const editing = this.vm.editingCell();
    const result = this.bindings.input.keyDown(
      event,
      this.vm.activeCell(),
      editing === null ? null : { row: editing.row, col: editing.col },
      this.vm.filterPopup() !== null,
    );
    if (result.preventDefault) event.preventDefault();
    if (result.scrollToCell) this.bindings.scrollToRow(result.scrollToCell.row);
  }

  protected onResizePointerDown(evt: ResizePointerDownEvent): void {
    if (this.bindings.input.resizePointerDown(evt.colIndex, evt.colWidth, evt.event)) {
      evt.event.preventDefault();
    }
  }

  protected onFilterApply(event: { colId: string; filter: ColumnFilterModel | null }): void {
    this.bindings.coreRef?.setFilter(event.colId, event.filter);
    this.vm.filterPopup.set(null);
  }

  protected onFilterClose(): void {
    this.bindings.coreRef?.closeFilterPopup();
    this.vm.filterPopup.set(null);
  }

  private onDocumentPointerMove = (event: PointerEvent): void => {
    if (this.bindings.input.documentPointerMove(event)) event.preventDefault();
  };

  private onDocumentPointerUp = (_event: PointerEvent): void => {
    const { wasRowDrag } = this.bindings.input.documentPointerUp();
    if (wasRowDrag) this.bindings.pendingRowDrag.releaseLocks();
  };
}
