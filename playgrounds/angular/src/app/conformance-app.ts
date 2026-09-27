import { AfterViewInit, Component, OnDestroy, computed, effect, signal, viewChild } from '@angular/core';
import { GpGridComponent, createColumnarDataSource } from '@gp-grid/angular';
import type {
  AngularColumnDefinition,
  CellValue,
  DataSource,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnLayoutMode,
  FreezeRowsOptions,
  GridCore,
  RowLoadingOptions,
  RowDragEndEvent,
  RowId,
} from '@gp-grid/angular';
import {
  createGeometryHooks,
  createLargeColumnarColumns,
  createLargeColumnarSource,
  createNarrowColumns,
  createWideColumns,
  createWideSource,
  type RequestedRange,
} from './conformance-geometry';
import {
  createFrozenFixture,
  FROZEN_HEADER_HEIGHT,
  FROZEN_HOST_HEIGHT,
  FROZEN_HOST_NARROW_HEIGHT,
  FROZEN_ROW_HEIGHT,
  NO_ROW_LOADING,
  type FrozenMode,
} from './conformance-frozen';
import {
  createRowHeightsFixture,
  ROW_HEIGHTS_HEADER_HEIGHT,
  ROW_HEIGHTS_ROW_HEIGHT,
  type RowHeightsMode,
} from './conformance-row-heights';

interface ConformanceRow {
  id: number;
  name: string;
  city: string;
  score: number;
  team: string;
  status: string;
  note: string;
  code: string;
}

const ROW_COUNT = 200;

const createRows = (): ConformanceRow[] => Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index,
  name: `Row ${index.toString().padStart(3, '0')}`,
  city: `City ${index % 11}`,
  score: index * 3,
  team: `Team ${index % 7}`,
  status: index % 2 === 0 ? 'active' : 'inactive',
  note: `Note ${index}`,
  code: `C-${index.toString().padStart(4, '0')}`,
}));

const createColumns = (): AngularColumnDefinition[] => [
  { colId: 'id', field: 'id', headerName: 'ID', width: 90, cellDataType: 'number', sortable: true },
  { colId: 'name', field: 'name', headerName: 'Name', width: 180, cellDataType: 'text', sortable: true, filterable: true, editable: true },
  { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
  { colId: 'score', field: 'score', headerName: 'Score', width: 120, cellDataType: 'number' },
  { colId: 'team', field: 'team', headerName: 'Team', width: 150, cellDataType: 'text' },
  { colId: 'status', field: 'status', headerName: 'Status', width: 130, cellDataType: 'text' },
  { colId: 'note', field: 'note', headerName: 'Note', width: 210, cellDataType: 'text' },
  { colId: 'code', field: 'code', headerName: 'Code', width: 160, cellDataType: 'text' },
];

/** Same columns, with a formatter so raw and displayed values differ. */
const createColumnarColumns = (): AngularColumnDefinition[] =>
  createColumns().map((column) =>
    column.field === 'score'
      ? { ...column, valueFormatter: (value: CellValue) => `${value} pts` }
      : column,
  );

const createColumnarFixture = () => {
  let reads = 0;
  const readRows = new Set<number>();
  // Borrowed stores are proxied so every numeric cell read is observable.
  const borrow = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(source, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          reads += 1;
          readRows.add(Number(property));
        }
        return Reflect.get(source, property, source);
      },
    });

  const id = borrow(new Int32Array(ROW_COUNT));
  const name = borrow(new Array<string>(ROW_COUNT));
  const city = borrow(new Array<string>(ROW_COUNT));
  const score = borrow(new Float64Array(ROW_COUNT));
  const team = borrow(new Array<string>(ROW_COUNT));
  const status = borrow(new Array<string>(ROW_COUNT));
  const note = borrow(new Array<string>(ROW_COUNT));
  const code = borrow(new Array<string>(ROW_COUNT));
  for (let index = 0; index < ROW_COUNT; index += 1) {
    id[index] = index;
    name[index] = `Row ${index.toString().padStart(3, '0')}`;
    city[index] = `City ${index % 11}`;
    score[index] = index * 3;
    team[index] = `Team ${index % 7}`;
    status[index] = index % 2 === 0 ? 'active' : 'inactive';
    note[index] = `Note ${index}`;
    code[index] = `C-${index.toString().padStart(4, '0')}`;
  }
  const source = createColumnarDataSource({
    rowCount: ROW_COUNT,
    getRowId: (row) => id[row]!,
    fields: [
      { field: 'id', data: id },
      { field: 'name', data: name },
      { field: 'city', data: city },
      { field: 'score', data: score },
      { field: 'team', data: team },
      { field: 'status', data: status },
      { field: 'note', data: note },
      { field: 'code', data: code },
    ],
  });

  let materializations = 0;
  const readRecord = source.getRecord.bind(source);
  source.getRecord = (row) => {
    materializations += 1;
    return readRecord(row);
  };

  return {
    source,
    data: { id, name, score },
    reads: () => reads,
    distinctRows: () => readRows.size,
    resetReads: () => {
      reads = 0;
      readRows.clear();
    },
    recordMaterializations: () => materializations,
  };
};

@Component({
  selector: 'app-root',
  imports: [GpGridComponent],
  template: `
    <main data-conformance-framework="angular" style="width: 620px; margin: 16px">
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
        <button data-testid="reset" (click)="reset()">Reset</button>
        <button data-testid="remount" (click)="remount()">Remount</button>
        <button data-testid="replace-columns" (click)="replaceColumns()">Replace columns</button>
        <button data-testid="apply-column-state" (click)="applyColumnState()">Apply column state</button>
        <button data-testid="reset-column-state" (click)="resetColumnState()">Reset column state</button>
        <button data-testid="apply-sort" (click)="applySort()">Apply sort</button>
        <button data-testid="apply-filter" (click)="applyFilter()">Apply filter</button>
        <button data-testid="move-column" (click)="moveColumn()">Move column</button>
        <button data-testid="drag-row" (click)="dragRow()">Drag row</button>
        <button data-testid="use-columnar" (click)="useColumnar()">Use columnar</button>
        <button data-testid="use-object" (click)="useObject()">Use object</button>
        <button data-testid="bump-revision" (click)="bumpRevision()">Bump revision</button>
        <button data-testid="use-narrow-columns" (click)="useNarrowColumns()">Narrow columns</button>
        <button data-testid="use-large-columnar" (click)="useLargeColumnar()">Large columnar</button>
        <button data-testid="use-wide-columns" (click)="useWideColumns(1000)">Wide columns</button>
        <button data-testid="pin-columns" (click)="pinColumns()">Pin columns</button>
        <button data-testid="unpin-all" (click)="unpinAll()">Unpin all</button>
        <button data-testid="toggle-column-layout" (click)="toggleColumnLayout()">Toggle layout</button>
        <button data-testid="resize-host" (click)="resizeHost()">Resize host</button>
        <button data-testid="hide-column" (click)="hideColumn()">Hide column</button>
        <button data-testid="toggle-rtl" (click)="toggleRtl()">Toggle RTL</button>
        <button data-testid="use-freeze-rows" (click)="useFreezeRows()">Freeze rows</button>
        <button data-testid="clear-freeze-rows" (click)="clearFreezeRows()">Clear freeze rows</button>
        <button data-testid="use-frozen-paged" (click)="useFrozenPaged()">Frozen paged</button>
        <button data-testid="use-frozen-paged-tight" (click)="useFrozenPagedTight()">Frozen paged tight</button>
        <button data-testid="use-frozen-object" (click)="useFrozenObject()">Frozen object</button>
        <button data-testid="freeze-count-3" (click)="freezeCount(3)">Freeze 3</button>
        <button data-testid="freeze-count-5" (click)="freezeCount(5)">Freeze 5</button>
        <button data-testid="freeze-through-5" (click)="freezeThrough5()">Freeze through 5</button>
        <button data-testid="unfreeze-in-place" (click)="unfreezeInPlace()">Unfreeze in place</button>
        <button data-testid="toggle-host-height" (click)="toggleHostHeight()">Toggle host height</button>
        <button data-testid="use-row-heights" (click)="useRowHeights()">Row heights</button>
        <button data-testid="use-row-heights-large" (click)="useRowHeightsLarge()">Heights large</button>
        <button data-testid="use-row-heights-paged" (click)="useRowHeightsPaged()">Heights paged</button>
        <button data-testid="set-row-heights" (click)="setRowHeights()">Set heights</button>
        <button data-testid="grow-above-viewport" (click)="growAboveViewport()">Grow above</button>
        <button data-testid="grow-frozen-row" (click)="growFrozenRow()">Grow frozen row</button>
        <button data-testid="reset-row-heights" (click)="resetRowHeights()">Reset heights</button>
        <output data-testid="metrics">{{ metrics() }}</output>
      </div>
      <div data-testid="grid-host" [attr.dir]="rtl() ? 'rtl' : 'ltr'" [style.width.px]="hostWidth()" [style.height.px]="hostHeight()">
        @if (mounted()) {
          @if (mode() === 'columnar') {
            <gp-grid
              [columns]="activeColumns()"
              [columnState]="frozenColumnState()"
              [columnLayout]="columnLayout()"
              [dataSource]="activeDataSource()"
              [rows]="emptyRows"
              [rowHeight]="frozenRowHeight()"
              [headerHeight]="frozenHeaderHeight()"
              [freezeRows]="freezeRowsBinding()"
              [rowLoading]="activeRowLoading()"
              [getRowId]="getRowId"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)"
              (onColumnResized)="onColumnResized($event)"
              (onColumnMoved)="onColumnMoved($event)"
              (onRowDragEnd)="onRowDragEnd($event)"
              (onColumnPinned)="onColumnPinned($event)"
              (onFrozenRowsChanged)="frozen.recordFreezeEvent($event)" />
          } @else {
            <gp-grid
              [columns]="activeColumns()"
              [columnState]="frozenColumnState()"
              [columnLayout]="columnLayout()"
              [rows]="activeRowData()"
              [rowHeight]="frozenRowHeight()"
              [headerHeight]="frozenHeaderHeight()"
              [freezeRows]="freezeRowsBinding()"
              [getRowId]="getRowId"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)"
              (onColumnResized)="onColumnResized($event)"
              (onColumnMoved)="onColumnMoved($event)"
              (onRowDragEnd)="onRowDragEnd($event)"
              (onColumnPinned)="onColumnPinned($event)"
              (onFrozenRowsChanged)="frozen.recordFreezeEvent($event)" />
          }
        }
      </div>
    </main>
  `,
})
export class ConformanceApp implements AfterViewInit, OnDestroy {
  protected readonly grid = viewChild(GpGridComponent);

  private readonly fixture = createColumnarFixture();
  protected readonly columnarSource = this.fixture.source;
  protected readonly largeColumnarSource = signal<ReturnType<typeof createLargeColumnarSource> | null>(null);
  protected readonly columnarColumns = signal<AngularColumnDefinition[]>(createColumnarColumns());
  protected readonly emptyRows: unknown[] = [];
  protected readonly rows = signal<ConformanceRow[]>(createRows());
  protected readonly columns = signal<AngularColumnDefinition[]>(createColumns());
  protected readonly frozen = createFrozenFixture();
  protected readonly frozenMode = signal<FrozenMode>('off');
  protected readonly frozenActive = computed(() => this.frozenMode() !== 'off');
  protected readonly rowHeights = createRowHeightsFixture();
  protected readonly rowHeightsMode = signal<RowHeightsMode>('off');
  protected readonly rowHeightsActive = computed(() => this.rowHeightsMode() !== 'off');
  protected readonly mode = signal<'object' | 'columnar'>('object');
  protected readonly revision = signal(0);
  protected readonly mounted = signal(true);
  protected readonly generation = signal(0);
  protected readonly editEvents = signal(0);
  protected readonly writeRejected = signal(0);
  protected readonly columnState = signal<ColumnStateUpdate[]>([]);
  protected readonly columnLayout = signal<ColumnLayoutMode>('fit');
  protected readonly hostWidth = signal(600);
  protected readonly hostHeight = signal(FROZEN_HOST_HEIGHT);
  protected readonly freezeOverride = signal<FreezeRowsOptions | undefined | null>(null);
  protected readonly rtl = signal(false);
  private readonly eventCounts = { resized: 0, moved: 0, dragged: 0, pinned: 0 };
  private readonly coreTokens = new WeakMap<object, number>();
  private nextCoreToken = 1;
  protected readonly metrics = () => JSON.stringify({
    generation: this.generation(),
    editEvents: this.editEvents(),
    writeRejected: this.writeRejected(),
    mode: this.mode(),
    revision: this.revision(),
  });
  protected readonly getRowId = (row: unknown): number => (row as ConformanceRow).id;

  /** Arming remounts the grid, so the readers follow the recreated core. */
  constructor() {
    effect(() => {
      const core = this.grid()?.core ?? null;
      this.frozen.track(core);
      // Arm presets run against the core the arm just created (D1, D2).
      if (core !== null && this.rowHeightsActive()) {
        this.rowHeights.applyPreset(core, this.rowHeightsMode());
      }
    });
  }

  private coreOf(): GridCore<unknown> | null {
    return this.grid()?.core ?? null;
  }

  private readCoreToken(): number {
    const core = this.coreOf();
    if (!core) return -1;
    const existing = this.coreTokens.get(core);
    if (existing !== undefined) return existing;
    const token = this.nextCoreToken;
    this.nextCoreToken += 1;
    this.coreTokens.set(core, token);
    return token;
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __gpConformance?: unknown }).__gpConformance = {
      getCellValue: (row: number, col: number): CellValue => this.coreOf()?.cells.getValue(row, col) ?? null,
      getFieldValue: (row: number, field: string): CellValue => this.coreOf()?.cells.getFieldValue(row, field) ?? null,
      revision: (): number => this.fixture.source.revision,
      sourceReads: (): number => this.fixture.reads(),
      sourceDistinctRows: (): number => this.fixture.distinctRows(),
      resetSourceReads: (): void => this.fixture.resetReads(),
      recordMaterializations: (): number => this.fixture.recordMaterializations(),
      coreToken: (): number => this.readCoreToken(),
      columnIds: (): string[] =>
        this.coreOf()?.columns.get().map((column) => column.colId ?? column.field) ?? [],
      columnState: (): ColumnStateSnapshot[] => this.coreOf()?.columns.getState() ?? [],
      sortColumn: (): string | null => this.coreOf()?.sortFilter.getSortModel()[0]?.colId ?? null,
      filterCount: (): number => Object.keys(this.coreOf()?.sortFilter.getFilterModel() ?? {}).length,
      eventCounts: () => ({ ...this.eventCounts }),
      resetEventCounts: (): void => {
        this.eventCounts.resized = 0;
        this.eventCounts.moved = 0;
        this.eventCounts.dragged = 0;
        this.eventCounts.pinned = 0;
      },
      useWideColumns: (count: number): void => this.useWideColumns(count),
      setFreezeCount: (count: number): void => this.setFreezeCount(count),
      ...createGeometryHooks(() => (this.coreOf() ?? null) as never, this.frozen),
      // Each arm records its own requests; the frozen reader is the other arm's.
      requestedRanges: (): RequestedRange[] =>
        this.rowHeightsActive() ? this.rowHeights.requestedRanges() : this.frozen.requestedRanges(),
    };
  }


  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    delete (window as unknown as { __gpConformance?: unknown }).__gpConformance;
  }

  protected useNarrowColumns(): void {
    this.columns.set(createNarrowColumns());
  }

  protected useLargeColumnar(): void {
    this.mode.set('columnar');
    this.columnarColumns.set(createLargeColumnarColumns());
    this.largeColumnarSource.set(createLargeColumnarSource());
    this.generation.update((value) => value + 1);
    this.revision.set(this.fixture.source.revision);
  }

  /** Arming swaps the data source and columns, so it remounts the grid. */
  private armFrozenRows(next: FrozenMode): void {
    this.frozenMode.set(next);
    this.rowHeightsMode.set('off');
    this.mode.set(next === 'object' || next === 'off' ? 'object' : 'columnar');
    this.remount();
  }

  /** The row-height arms remount the same way, and clear the frozen arm. */
  private armRowHeights(next: RowHeightsMode): void {
    this.rowHeightsMode.set(next);
    this.frozenMode.set('off');
    this.mode.set(next === 'object' || next === 'off' ? 'object' : 'columnar');
    this.remount();
  }

  protected useFreezeRows(): void {
    this.armFrozenRows('columnar');
  }

  protected clearFreezeRows(): void {
    this.armFrozenRows('off');
  }

  protected useFrozenPaged(): void {
    this.armFrozenRows('paged');
  }

  protected useFrozenPagedTight(): void {
    this.armFrozenRows('paged-tight');
  }

  protected useFrozenObject(): void {
    this.armFrozenRows('object');
  }

  protected useRowHeights(): void {
    this.armRowHeights('object');
  }

  protected useRowHeightsLarge(): void {
    this.armRowHeights('large');
  }

  protected useRowHeightsPaged(): void {
    this.armRowHeights('paged');
  }

  // In-place controls: the option stays reactive, so these never touch the
  // remount `generation`. `null` means "the armed mode's own option".
  protected freezeCount(count: number): void {
    this.freezeOverride.set({ count });
  }

  protected freezeThrough5(): void {
    this.coreOf()?.frozenRows.freezeThrough(5);
  }

  protected unfreezeInPlace(): void {
    this.freezeOverride.set(undefined);
  }

  /** Drives the core's own setter: a button click would blur and commit. */
  protected setFreezeCount(count: number): void {
    this.coreOf()?.frozenRows.set({ count });
  }

  protected toggleHostHeight(): void {
    this.hostHeight.update((current) =>
      current === FROZEN_HOST_HEIGHT ? FROZEN_HOST_NARROW_HEIGHT : FROZEN_HOST_HEIGHT);
  }

  /** In-place height controls: the arm stays mounted (AC-006-01/03/04). */
  protected setRowHeights(): void {
    const core = this.coreOf();
    if (core) this.rowHeights.setControlHeights(core);
  }

  protected growAboveViewport(): void {
    const core = this.coreOf();
    if (core) this.rowHeights.growAboveViewport(core);
  }

  protected growFrozenRow(): void {
    const core = this.coreOf();
    if (core) this.rowHeights.growFrozenRow(core);
  }

  protected resetRowHeights(): void {
    const core = this.coreOf();
    if (core) this.rowHeights.resetHeights(core);
  }

  /** A frozen or height arm replaces the data source; otherwise the mode picks it. */
  protected activeDataSource(): DataSource<never> {
    if (this.rowHeightsActive()) return this.rowHeights.sourceFor(this.rowHeightsMode()) ?? this.columnarSource;
    if (this.frozenActive()) return this.frozen.sourceFor(this.frozenMode()) ?? this.columnarSource;
    return this.largeColumnarSource() ?? this.columnarSource;
  }

  protected activeColumns(): AngularColumnDefinition[] {
    const heightsColumns = this.rowHeightsActive() ? this.rowHeights.columnsFor(this.rowHeightsMode()) : undefined;
    if (heightsColumns !== undefined) return heightsColumns;
    const frozenColumns = this.frozenActive() ? this.frozen.columnsFor(this.frozenMode()) : undefined;
    if (frozenColumns !== undefined) return frozenColumns;
    return this.mode() === 'columnar' ? this.columnarColumns() : this.columns();
  }

  /** The writable arms keep the caller's object rows; every other one is sourced. */
  protected activeRowData(): ConformanceRow[] {
    const heightsRows = this.rowHeightsActive() ? this.rowHeights.rowDataFor(this.rowHeightsMode()) : undefined;
    return heightsRows ?? this.rows();
  }

  protected activeFreezeRows(): FreezeRowsOptions | undefined {
    if (this.freezeOverride() !== null) return this.freezeOverride() ?? undefined;
    return this.frozen.freezeRowsFor(this.frozenMode());
  }

  // The emitted input type drops `| undefined` (ng-packagr), so the binding
  // coalesces; `{ count: 0 }` resolves the same flat request as an absent option.
  protected freezeRowsBinding(): FreezeRowsOptions {
    return this.activeFreezeRows() ?? { count: 0 };
  }

  protected activeRowLoading(): RowLoadingOptions {
    const heightsLoading = this.rowHeightsActive() ? this.rowHeights.rowLoadingFor(this.rowHeightsMode()) : undefined;
    return heightsLoading ?? this.frozen.rowLoadingFor(this.frozenMode()) ?? NO_ROW_LOADING;
  }

  protected frozenColumnState(): ColumnStateUpdate[] {
    return this.frozenActive() ? this.frozen.columnState : this.columnState();
  }

  protected frozenRowHeight(): number {
    if (this.frozenActive()) return FROZEN_ROW_HEIGHT;
    if (this.rowHeightsActive()) return ROW_HEIGHTS_ROW_HEIGHT;
    return 32;
  }

  protected frozenHeaderHeight(): number {
    if (this.frozenActive()) return FROZEN_HEADER_HEIGHT;
    if (this.rowHeightsActive()) return ROW_HEIGHTS_HEADER_HEIGHT;
    return 36;
  }

  /** Wide fixtures bind an accessor source: no per-row storage for 10k columns. */
  protected useWideColumns(count: number): void {
    this.mode.set('columnar');
    this.columnarColumns.set(createWideColumns(count));
    this.largeColumnarSource.set(createWideSource(count));
    this.generation.update((value) => value + 1);
  }

  protected pinColumns(): void {
    this.columnState.set([
      { columnId: 'id', pinned: 'start' },
      { columnId: 'name', pinned: 'start' },
      { columnId: 'code', pinned: 'end' },
    ]);
  }

  protected unpinAll(): void {
    this.columnState.set([]);
    const core = this.coreOf();
    for (const column of core?.columns.get() ?? []) {
      core?.columns.setPinned(column.colId ?? column.field, null);
    }
  }

  protected toggleColumnLayout(): void {
    this.columnLayout.update((current) => (current === 'fit' ? 'fixed' : 'fit'));
  }

  protected resizeHost(): void {
    this.hostWidth.update((current) => (current === 600 ? 800 : 600));
  }

  protected replaceColumns(): void {
    this.columns.set([
      { colId: 'score', field: 'score', headerName: 'Score', width: 120, cellDataType: 'number' },
      { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
      { colId: 'replacement', field: 'code', headerName: 'Replacement', width: 190, cellDataType: 'text' },
    ]);
  }

  protected hideColumn(): void {
    this.columnState.update((current) => [...current, { columnId: 'id', hidden: true }]);
  }

  protected reset(): void {
    this.mounted.set(false);
    this.frozenMode.set('off');
    this.rowHeightsMode.set('off');
    this.rows.set(createRows());
    this.columns.set(createColumns());
    this.columnarColumns.set(createColumnarColumns());
    this.columnState.set([]);
    this.mode.set('object');
    this.hostHeight.set(FROZEN_HOST_HEIGHT);
    this.freezeOverride.set(null);
    this.rtl.set(false);
    this.editEvents.set(0);
    this.writeRejected.set(0);
    this.eventCounts.resized = 0;
    this.eventCounts.moved = 0;
    this.eventCounts.dragged = 0;
    this.eventCounts.pinned = 0;
    window.setTimeout(() => {
      this.generation.update((value) => value + 1);
      this.mounted.set(true);
    }, 0);
  }

  protected remount(): void {
    this.mounted.set(false);
    window.setTimeout(() => {
      this.generation.update((value) => value + 1);
      this.mounted.set(true);
    }, 0);
  }

  /** A `dir` flip needs a remount: direction is sampled at mount/resize. */
  protected toggleRtl(): void {
    this.rtl.update((current) => !current);
    this.remount();
  }

  protected useColumnar(): void {
    this.mode.set('columnar');
    this.revision.set(this.fixture.source.revision);
  }

  protected useObject(): void {
    this.mode.set('object');
  }

  /** In-place same-array update followed by an explicit revision refresh. */
  protected async bumpRevision(): Promise<void> {
    this.fixture.data.name[0] = 'Row revised';
    this.fixture.data.score[0] = 7;
    const next = this.fixture.source.revision + 1;
    this.fixture.source.setRevision(next);
    this.revision.set(next);
    await this.coreOf()?.refresh();
  }

  protected onCellValueChanged(event: CellValueChangedEvent<unknown>): void {
    this.rows.update((rows) => rows.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row));
    this.editEvents.update((value) => value + 1);
  }

  protected onWriteRejected(_event: CellWriteRejectedEvent): void {
    this.writeRejected.update((value) => value + 1);
  }

  protected onColumnResized(_event: ColumnResizedEvent): void {
    this.eventCounts.resized += 1;
  }

  protected onColumnMoved(_event: ColumnMovedEvent): void {
    this.eventCounts.moved += 1;
  }

  protected onRowDragEnd(_event: RowDragEndEvent): void {
    this.eventCounts.dragged += 1;
  }

  protected onColumnPinned(_event: ColumnPinnedEvent): void {
    this.eventCounts.pinned += 1;
  }

  protected applyColumnState(): void {
    this.columnState.set([{ columnId: 'city', width: 260 }]);
  }

  protected resetColumnState(): void {
    this.columnState.set([]);
    this.coreOf()?.columns.resetState();
  }

  protected applySort(): void {
    void this.coreOf()?.sortFilter.setSort('score', 'asc');
  }

  protected applyFilter(): void {
    void this.coreOf()?.sortFilter.setFilter('city', 'City 1');
  }

  protected moveColumn(): void {
    this.coreOf()?.columns.move(0, 2);
  }

  protected dragRow(): void {
    this.coreOf()?.rowDrag.commit(0, 1);
  }
}
