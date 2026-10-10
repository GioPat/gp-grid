import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, computed, effect, signal, viewChild } from '@angular/core';
import { GpGridComponent, createColumnarDataSource } from '@gp-grid/angular';
import type {
  AngularColumnDefinition,
  AngularColumnGroupChild,
  CellRendererTemplate,
  CellValue,
  DataSource,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnMovedEvent,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnLayoutMode,
  FreezeRowsOptions,
  GridCore,
  GroupLabelRendererTemplate,
  RowGrouping,
  RowLoadingOptions,
  RowDragEndEvent,
  RowId,
  RowResizedEvent,
} from '@gp-grid/angular';
import {
  createFitHooks,
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
import {
  AUTO_FIT_COLUMN_LAYOUT,
  AUTO_FIT_HEADER_HEIGHT,
  AUTO_FIT_ROW_HEIGHT,
  createAutoFitFixture,
  type AutoFitMode,
} from './conformance-auto-fit';
import {
  COLUMN_GROUPS_COLUMN_LAYOUT,
  COLUMN_GROUPS_HEADER_HEIGHT,
  COLUMN_GROUPS_HOST_HEIGHT,
  COLUMN_GROUPS_ROW_HEIGHT,
  createColumnGroupHooks,
  createColumnGroupsFixture,
  type ColumnGroupsMode,
  type ColumnGroupsSchema,
} from './conformance-column-groups';
import {
  createRowGroupsFixture,
  ROW_GROUPS_COLUMN_LAYOUT,
  ROW_GROUPS_HEADER_HEIGHT,
  ROW_GROUPS_ROW_HEIGHT,
  ROW_KIND_PROBE,
  type RowGroupsArm,
  type RowGroupsColumnsVariant,
  type RowGroupsMode,
} from './conformance-row-groups';

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

/** One fixture arm at a time; `none` keeps the fixture's own grid. */
type FixtureArm =
  | { fixture: 'none' }
  | { fixture: 'frozen'; mode: FrozenMode }
  | { fixture: 'rowHeights'; mode: RowHeightsMode }
  | { fixture: 'autoFit'; mode: AutoFitMode }
  | { fixture: 'columnGroups'; mode: ColumnGroupsMode }
  | { fixture: 'rowGroups'; mode: RowGroupsMode };

const NO_ARM: FixtureArm = { fixture: 'none' };
// Shared empties, so an unchanged binding keeps its identity.
const NO_BAND_HEIGHTS: readonly number[] = [];
const NO_GROUP_LIMITS: ColumnGroupLimits = {};

/** Arms whose rows reach the grid through a data source take the columnar branch. */
const isSourcedArm = (arm: FixtureArm): boolean => {
  if (arm.fixture === 'rowGroups') return true;
  if (arm.fixture === 'frozen' || arm.fixture === 'rowHeights') return arm.mode !== 'object';
  return arm.fixture === 'autoFit' && arm.mode === 'paged';
};

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
    <!-- PRD 008: prints the renderer's rowKind, so a spec can read it. -->
    <ng-template #rowKindProbe let-params>
      <span class="rg-kind-probe" [attr.data-probe-kind]="params.rowKind ?? 'flat'">{{ params.value ?? '' }}</span>
    </ng-template>
    <!-- The external arm's label: the formatted text and a button wired to toggle. -->
    <ng-template #externalLabel let-params>
      <span class="rg-custom-label" [attr.data-row-kind]="params.row.kind">{{ params.label }}@if (params.row.kind === 'group') {<button
          type="button"
          class="rg-custom-toggle"
          aria-label="Toggle group"
          style="width: 14px; height: 14px; margin-inline-start: 4px"
          (click)="params.toggle()"></button>}</span>
    </ng-template>
    <main data-conformance-framework="angular" style="width: 620px; margin: 16px">
      <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
        <button data-testid="reset" (click)="reset()">Reset</button>
        <button data-testid="remount" (click)="remount()">Remount</button>
        <button data-testid="replace-columns" (click)="rowGroupsActive() ? setRowGroupColumns('replaced') : replaceColumns()">Replace columns</button>
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
        <button data-testid="use-auto-fit" (click)="useAutoFit()">Auto fit</button>
        <button data-testid="use-auto-fit-paged" (click)="useAutoFitPaged()">Auto fit paged</button>
        <button data-testid="freeze-two" (click)="freezeCount(2)">Freeze 2</button>
        <button data-testid="use-column-groups" (click)="armColumnGroups('groups')">Column groups</button>
        <button data-testid="use-wide-groups" (click)="armColumnGroups('wide')">Wide groups</button>
        <button data-testid="move-x-between" (click)="withCore(columnGroups.moveXBetween)">X between</button>
        <button data-testid="move-x-back" (click)="withCore(columnGroups.moveXBack)">X back</button>
        <button data-testid="hide-b" (click)="setHiddenB(true)">Hide B</button>
        <button data-testid="show-b" (click)="setHiddenB(false)">Show B</button>
        <button data-testid="pin-a" (click)="pinA()">Pin A</button>
        <button data-testid="reset-order" (click)="withCore(columnGroups.resetOrder)">Reset order</button>
        <button data-testid="replace-groups" (click)="replaceSchema(columnGroups.replacement)">Replace groups</button>
        <button data-testid="reject-cycle" (click)="replaceSchema(columnGroups.cyclic)">Reject cycle</button>
        <button data-testid="reject-missing" (click)="replaceSchema(columnGroups.missing)">Reject missing</button>
        <button data-testid="over-budget-move" (click)="overBudgetMove()">Over budget</button>
        <button data-testid="tall-band" (click)="tallBand()">Tall band</button>
        <button data-testid="freeze-three" (click)="freezeCount(3)">Freeze 3 rows</button>
        <button data-testid="use-row-groups" (click)="armRowGroups('object')">RG</button>
        <button data-testid="use-row-groups-columnar" (click)="armRowGroups('columnar')">RG col</button>
        <button data-testid="use-row-groups-external" (click)="armRowGroups('external')">RG ext</button>
        <button data-testid="use-row-groups-paged" (click)="armRowGroups('paged')">RG page</button>
        <button data-testid="expand-all" (click)="withCore(rowGroups.expandAll)">Exp</button>
        <button data-testid="collapse-all" (click)="withCore(rowGroups.collapseAll)">Col</button>
        <button data-testid="tall-leaf" (click)="withCore(rowGroups.tallLeaf)">Tall</button>
        <button data-testid="ungroup" (click)="ungroup()">Flat</button>
        <button data-testid="replace-revision" (click)="replaceRevision()">Rev</button>
        <button data-testid="format-country" (click)="setRowGroupColumns('formatted')">Fmt</button>
        <output data-testid="metrics">{{ metrics() }}</output>
      </div>
      <div data-testid="grid-host" [attr.dir]="rtl() ? 'rtl' : 'ltr'" [style.width.px]="hostWidth()" [style.height.px]="activeHostHeight()">
        @if (mounted()) {
          @if (mode() === 'columnar') {
            <gp-grid
              [columns]="activeColumns()"
              [columnState]="frozenColumnState()"
              [columnLayout]="activeColumnLayout()"
              [dataSource]="activeDataSource()"
              [rows]="emptyRows"
              [rowHeight]="frozenRowHeight()"
              [headerHeight]="frozenHeaderHeight()"
              [freezeRows]="freezeRowsBinding()"
              [rowResize]="autoFitActive()"
              [rowLoading]="activeRowLoading()"
              [getRowId]="getRowId"
              [cellRenderers]="rowGroupRenderers"
              [rowGrouping]="activeRowGrouping()"
              [groupLabelColumn]="activeGroupLabelColumn()"
              [groupLabelRenderer]="activeGroupLabelRenderer()"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)"
              (onColumnResized)="onColumnResized($event)"
              (onColumnMoved)="onColumnMoved($event)"
              (onRowDragEnd)="onRowDragEnd($event)"
              (onColumnPinned)="onColumnPinned($event)"
              (onRowResized)="onRowResized($event)"
              (onFrozenRowsChanged)="frozen.recordFreezeEvent($event)"
              (onRowGroupToggled)="rowGroups.recordToggle($event)"
              (onRowGroupingRejected)="rowGroups.recordRejection($event)" />
          } @else {
            <gp-grid
              [columns]="activeColumns()"
              [columnState]="frozenColumnState()"
              [columnLayout]="activeColumnLayout()"
              [rows]="activeRowData()"
              [rowHeight]="frozenRowHeight()"
              [headerHeight]="frozenHeaderHeight()"
              [columnGroups]="activeColumnGroups()"
              [headerBandHeights]="activeBandHeights()"
              [columnGroupLimits]="activeGroupLimits()"
              [freezeRows]="freezeRowsBinding()"
              [rowResize]="autoFitActive()"
              [getRowId]="getRowId"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)"
              (onColumnResized)="onColumnResized($event)"
              (onColumnMoved)="onColumnMoved($event)"
              (onRowDragEnd)="onRowDragEnd($event)"
              (onColumnPinned)="onColumnPinned($event)"
              (onRowResized)="onRowResized($event)"
              (onColumnSchemaRejected)="columnGroups.recordRejection($event)"
              (onFrozenRowsChanged)="frozen.recordFreezeEvent($event)" />
          }
        }
      </div>
    </main>
  `,
})
export class ConformanceApp implements OnInit, AfterViewInit, OnDestroy {
  protected readonly grid = viewChild(GpGridComponent);

  private readonly fixture = createColumnarFixture();
  protected readonly columnarSource = this.fixture.source;
  protected readonly largeColumnarSource = signal<ReturnType<typeof createLargeColumnarSource> | null>(null);
  protected readonly columnarColumns = signal<AngularColumnDefinition[]>(createColumnarColumns());
  protected readonly emptyRows: unknown[] = [];
  protected readonly rows = signal<ConformanceRow[]>(createRows());
  protected readonly columns = signal<AngularColumnDefinition[]>(createColumns());
  protected readonly arm = signal<FixtureArm>(NO_ARM);
  protected readonly frozen = createFrozenFixture();
  protected readonly frozenMode = computed<FrozenMode>(() => {
    const arm = this.arm();
    return arm.fixture === 'frozen' ? arm.mode : 'off';
  });
  protected readonly frozenActive = computed(() => this.frozenMode() !== 'off');
  protected readonly rowHeights = createRowHeightsFixture();
  protected readonly rowHeightsMode = computed<RowHeightsMode>(() => {
    const arm = this.arm();
    return arm.fixture === 'rowHeights' ? arm.mode : 'off';
  });
  protected readonly rowHeightsActive = computed(() => this.rowHeightsMode() !== 'off');
  protected readonly autoFit = createAutoFitFixture();
  protected readonly autoFitMode = computed<AutoFitMode>(() => {
    const arm = this.arm();
    return arm.fixture === 'autoFit' ? arm.mode : 'off';
  });
  protected readonly autoFitActive = computed(() => this.autoFitMode() !== 'off');
  protected readonly columnGroups = createColumnGroupsFixture();
  protected readonly columnGroupsMode = computed<ColumnGroupsMode>(() => {
    const arm = this.arm();
    return arm.fixture === 'columnGroups' ? arm.mode : 'off';
  });
  protected readonly columnGroupsActive = computed(() => this.columnGroupsMode() !== 'off');
  protected readonly groupsSchema = signal<ColumnGroupsSchema>(this.columnGroups.schemaFor('off'));
  protected readonly rowGroups = createRowGroupsFixture();
  protected readonly rowGroupsMode = computed<RowGroupsMode>(() => {
    const arm = this.arm();
    return arm.fixture === 'rowGroups' ? arm.mode : 'off';
  });
  protected readonly rowGroupsActive = computed(() => this.rowGroupsMode() !== 'off');
  protected readonly rowGroupsArm = signal<RowGroupsArm>({ columns: [], grouping: null });
  @ViewChild('rowKindProbe', { static: true }) protected rowKindProbe!: CellRendererTemplate;
  @ViewChild('externalLabel', { static: true }) protected externalLabel!: GroupLabelRendererTemplate;
  protected rowGroupRenderers: Record<string, CellRendererTemplate> = {};
  protected readonly bandHeights = signal<readonly number[]>(NO_BAND_HEIGHTS);
  protected readonly groupLimits = signal<ColumnGroupLimits>(NO_GROUP_LIMITS);
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
  private readonly eventCounts = { resized: 0, moved: 0, dragged: 0, pinned: 0, rowResized: 0 };
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

  ngOnInit(): void {
    this.rowGroupRenderers = { [ROW_KIND_PROBE]: this.rowKindProbe };
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
      eventCounts: () => ({ ...this.eventCounts, ...this.rowGroups.eventCounts() }),
      resetEventCounts: (): void => {
        this.rowGroups.resetEventCounts();
        this.eventCounts.resized = 0;
        this.eventCounts.moved = 0;
        this.eventCounts.dragged = 0;
        this.eventCounts.pinned = 0;
        this.eventCounts.rowResized = 0;
      },
      useWideColumns: (count: number): void => this.useWideColumns(count),
      setFreezeCount: (count: number): void => this.setFreezeCount(count),
      ...createGeometryHooks(() => (this.coreOf() ?? null) as never, this.frozen),
      ...createFitHooks(() => this.coreOf()),
      ...createColumnGroupHooks(() => this.coreOf(), this.columnGroups, {
        setGroups: (groups) => this.groupsSchema.update((schema) => ({ columns: schema.columns, groups })),
        setBandHeights: (heights) => this.bandHeights.set(heights ?? NO_BAND_HEIGHTS),
      }),
      ...this.rowGroups.createHooks(() => this.coreOf()),
      // Each arm records its own requests; the frozen reader is the other arms'.
      requestedRanges: (): RequestedRange[] => {
        if (this.autoFitActive()) return this.autoFit.requestedRanges();
        return this.rowHeightsActive() ? this.rowHeights.requestedRanges() : this.frozen.requestedRanges();
      },
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
  private armFixture(next: FixtureArm): void {
    this.arm.set(next);
    this.mode.set(isSourcedArm(next) ? 'columnar' : 'object');
    this.remount();
  }

  protected useFreezeRows(): void {
    this.armFixture({ fixture: 'frozen', mode: 'columnar' });
  }

  protected clearFreezeRows(): void {
    this.armFixture(NO_ARM);
  }

  protected useFrozenPaged(): void {
    this.armFixture({ fixture: 'frozen', mode: 'paged' });
  }

  protected useFrozenPagedTight(): void {
    this.armFixture({ fixture: 'frozen', mode: 'paged-tight' });
  }

  protected useFrozenObject(): void {
    this.armFixture({ fixture: 'frozen', mode: 'object' });
  }

  protected useRowHeights(): void {
    this.armFixture({ fixture: 'rowHeights', mode: 'object' });
  }

  protected useRowHeightsLarge(): void {
    this.armFixture({ fixture: 'rowHeights', mode: 'large' });
  }

  protected useRowHeightsPaged(): void {
    this.armFixture({ fixture: 'rowHeights', mode: 'paged' });
  }

  protected useAutoFit(): void {
    this.armFixture({ fixture: 'autoFit', mode: 'object' });
  }

  protected useAutoFitPaged(): void {
    this.armFixture({ fixture: 'autoFit', mode: 'paged' });
  }

  /** The group arms also reset the hierarchy, the band heights and the budgets. */
  protected armColumnGroups(next: ColumnGroupsMode): void {
    this.groupsSchema.set(this.columnGroups.schemaFor(next));
    this.bandHeights.set(NO_BAND_HEIGHTS);
    this.groupLimits.set(NO_GROUP_LIMITS);
    this.columnGroups.clearResult();
    this.armFixture({ fixture: 'columnGroups', mode: next });
  }

  /** Row group arms (PRD 008): fresh rows, source and grouping, then a remount. */
  protected armRowGroups(next: RowGroupsMode): void {
    this.rowGroupsArm.set(this.rowGroups.arm(next));
    this.armFixture({ fixture: 'rowGroups', mode: next });
  }

  /** In place: the grid keeps its core and regroups or relabels. */
  protected setRowGroupColumns(variant: RowGroupsColumnsVariant): void {
    const columns = this.rowGroups.columnsFor(this.rowGroupsMode(), variant);
    this.rowGroupsArm.update((current) => ({ ...current, columns }));
  }

  protected ungroup(): void {
    this.rowGroupsArm.update((current) => ({ ...current, grouping: null }));
  }

  protected replaceRevision(): void {
    this.withCore((core) => void this.rowGroups.replaceRevision(core));
  }

  // The published input typing drops `| null`, while the input takes it at runtime.
  protected activeRowGrouping(): RowGrouping {
    const grouping = this.rowGroupsActive() ? this.rowGroupsArm().grouping : null;
    return grouping as RowGrouping;
  }

  protected activeGroupLabelRenderer(): GroupLabelRendererTemplate {
    const renderer = this.rowGroupsMode() === 'external' ? this.externalLabel : null;
    return renderer as GroupLabelRendererTemplate;
  }

  protected activeGroupLabelColumn(): string {
    return this.rowGroupsActive() ? this.rowGroups.labelColumn() : '';
  }

  /** Group controls: commands go through the core, the schema through the inputs (PRD 007). */
  protected withCore(run: (core: GridCore<unknown>) => void): void {
    const core = this.coreOf();
    if (core) run(core);
  }

  protected setHiddenB(hidden: boolean): void {
    this.withCore((core) => this.columnGroups.setHidden(core, 'b', hidden));
  }

  protected pinA(): void {
    this.withCore((core) => this.columnGroups.pin(core, 'a', 'start'));
  }

  protected replaceSchema(next: (schema: ColumnGroupsSchema) => ColumnGroupsSchema): void {
    this.columnGroups.clearResult();
    this.groupsSchema.update(next);
  }

  protected tallBand(): void {
    this.withCore((core) => this.bandHeights.set(this.columnGroups.tallBandHeights(core)));
  }

  /** Budgets are creation-only, so arming one remounts the grid. */
  protected overBudgetMove(): void {
    this.withCore((core) => {
      this.groupLimits.set(this.columnGroups.overBudgetLimits(core));
      this.remount();
    });
  }

  // The published input typings drop `| undefined` (ng-packagr), while the
  // inputs take it at runtime: `undefined` keeps the grid flat.
  protected activeColumnGroups(): readonly AngularColumnGroupChild[] {
    const groups: readonly ColumnGroupChild[] | undefined =
      this.columnGroupsActive() ? this.groupsSchema().groups : undefined;
    return groups as readonly AngularColumnGroupChild[];
  }

  protected activeBandHeights(): readonly number[] {
    return this.columnGroupsActive() ? this.bandHeights() : NO_BAND_HEIGHTS;
  }

  protected activeGroupLimits(): ColumnGroupLimits {
    return this.columnGroupsActive() ? this.groupLimits() : NO_GROUP_LIMITS;
  }

  protected activeHostHeight(): number {
    return this.columnGroupsActive() ? COLUMN_GROUPS_HOST_HEIGHT : this.hostHeight();
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
    if (this.rowGroupsActive()) return this.rowGroups.source() ?? this.columnarSource;
    if (this.autoFitActive()) return this.autoFit.sourceFor(this.autoFitMode()) ?? this.columnarSource;
    if (this.rowHeightsActive()) return this.rowHeights.sourceFor(this.rowHeightsMode()) ?? this.columnarSource;
    if (this.frozenActive()) return this.frozen.sourceFor(this.frozenMode()) ?? this.columnarSource;
    return this.largeColumnarSource() ?? this.columnarSource;
  }

  protected activeColumns(): AngularColumnDefinition[] {
    if (this.rowGroupsActive()) return this.rowGroupsArm().columns;
    if (this.columnGroupsActive()) return this.groupsSchema().columns;
    const fitColumns = this.autoFitActive() ? this.autoFit.columnsFor(this.autoFitMode()) : undefined;
    if (fitColumns !== undefined) return fitColumns;
    const heightsColumns = this.rowHeightsActive() ? this.rowHeights.columnsFor(this.rowHeightsMode()) : undefined;
    if (heightsColumns !== undefined) return heightsColumns;
    const frozenColumns = this.frozenActive() ? this.frozen.columnsFor(this.frozenMode()) : undefined;
    if (frozenColumns !== undefined) return frozenColumns;
    return this.mode() === 'columnar' ? this.columnarColumns() : this.columns();
  }

  /** The writable arms keep the caller's object rows; every other one is sourced. */
  protected activeRowData(): ConformanceRow[] {
    const groupRows = this.columnGroupsActive() ? this.columnGroups.rowDataFor(this.columnGroupsMode()) : undefined;
    if (groupRows !== undefined) return groupRows as unknown as ConformanceRow[];
    const fitRows = this.autoFitActive() ? this.autoFit.rowDataFor(this.autoFitMode()) : undefined;
    if (fitRows !== undefined) return fitRows as unknown as ConformanceRow[];
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
    if (this.rowGroupsActive()) return this.rowGroups.rowLoading() ?? NO_ROW_LOADING;
    const fitLoading = this.autoFitActive() ? this.autoFit.rowLoadingFor(this.autoFitMode()) : undefined;
    if (fitLoading !== undefined) return fitLoading;
    const heightsLoading = this.rowHeightsActive() ? this.rowHeights.rowLoadingFor(this.rowHeightsMode()) : undefined;
    return heightsLoading ?? this.frozen.rowLoadingFor(this.frozenMode()) ?? NO_ROW_LOADING;
  }

  protected frozenColumnState(): ColumnStateUpdate[] {
    return this.frozenActive() ? this.frozen.columnState : this.columnState();
  }

  protected frozenRowHeight(): number {
    if (this.frozenActive()) return FROZEN_ROW_HEIGHT;
    if (this.rowHeightsActive()) return ROW_HEIGHTS_ROW_HEIGHT;
    if (this.autoFitActive()) return AUTO_FIT_ROW_HEIGHT;
    if (this.columnGroupsActive()) return COLUMN_GROUPS_ROW_HEIGHT;
    if (this.rowGroupsActive()) return ROW_GROUPS_ROW_HEIGHT;
    return 32;
  }

  protected frozenHeaderHeight(): number {
    if (this.frozenActive()) return FROZEN_HEADER_HEIGHT;
    if (this.rowHeightsActive()) return ROW_HEIGHTS_HEADER_HEIGHT;
    if (this.autoFitActive()) return AUTO_FIT_HEADER_HEIGHT;
    if (this.columnGroupsActive()) return COLUMN_GROUPS_HEADER_HEIGHT;
    if (this.rowGroupsActive()) return ROW_GROUPS_HEADER_HEIGHT;
    return 36;
  }

  protected activeColumnLayout(): ColumnLayoutMode {
    if (this.autoFitActive()) return AUTO_FIT_COLUMN_LAYOUT;
    if (this.rowGroupsActive()) return ROW_GROUPS_COLUMN_LAYOUT;
    return this.columnGroupsActive() ? COLUMN_GROUPS_COLUMN_LAYOUT : this.columnLayout();
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
    this.arm.set(NO_ARM);
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
    this.eventCounts.rowResized = 0;
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

  protected onWriteRejected(event: CellWriteRejectedEvent): void {
    this.rowGroups.recordWriteRejected(event);
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

  protected onRowResized(_event: RowResizedEvent): void {
    this.eventCounts.rowResized += 1;
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
