import { AfterViewInit, Component, OnDestroy, ViewChild, signal } from '@angular/core';
import { GpGridComponent, createColumnarDataSource } from '@gp-grid/angular';
import type {
  AngularColumnDefinition,
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
} from '@gp-grid/angular';

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
        <button data-testid="use-columnar" (click)="useColumnar()">Use columnar</button>
        <button data-testid="use-object" (click)="useObject()">Use object</button>
        <button data-testid="bump-revision" (click)="bumpRevision()">Bump revision</button>
        <output data-testid="metrics">{{ metrics() }}</output>
      </div>
      <div data-testid="grid-host" style="width: 600px; height: 360px">
        @if (mounted()) {
          @if (mode() === 'columnar') {
            <gp-grid
              [columns]="columnarColumns"
              [dataSource]="columnarSource"
              [rows]="emptyRows"
              [rowHeight]="32"
              [headerHeight]="36"
              [getRowId]="getRowId"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)" />
          } @else {
            <gp-grid
              [columns]="columns()"
              [rows]="rows()"
              [rowHeight]="32"
              [headerHeight]="36"
              [getRowId]="getRowId"
              (onCellValueChanged)="onCellValueChanged($event)"
              (onWriteRejected)="onWriteRejected($event)" />
          }
        }
      </div>
    </main>
  `,
})
export class ConformanceApp implements AfterViewInit, OnDestroy {
  @ViewChild(GpGridComponent) protected grid?: GpGridComponent;

  private readonly fixture = createColumnarFixture();
  protected readonly columnarSource = this.fixture.source;
  protected readonly columnarColumns = createColumnarColumns();
  protected readonly emptyRows: unknown[] = [];
  protected readonly rows = signal<ConformanceRow[]>(createRows());
  protected readonly columns = signal<AngularColumnDefinition[]>(createColumns());
  protected readonly mode = signal<'object' | 'columnar'>('object');
  protected readonly revision = signal(0);
  protected readonly mounted = signal(true);
  protected readonly generation = signal(0);
  protected readonly editEvents = signal(0);
  protected readonly writeRejected = signal(0);
  protected readonly metrics = () => JSON.stringify({
    generation: this.generation(),
    editEvents: this.editEvents(),
    writeRejected: this.writeRejected(),
    mode: this.mode(),
    revision: this.revision(),
  });
  protected readonly getRowId = (row: unknown): number => (row as ConformanceRow).id;

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __gpConformance?: unknown }).__gpConformance = {
      getCellValue: (row: number, col: number): CellValue => this.grid?.core?.getCellValue(row, col) ?? null,
      getFieldValue: (row: number, field: string): CellValue => this.grid?.core?.getFieldValue(row, field) ?? null,
      revision: (): number => this.fixture.source.revision,
      sourceReads: (): number => this.fixture.reads(),
      sourceDistinctRows: (): number => this.fixture.distinctRows(),
      resetSourceReads: (): void => this.fixture.resetReads(),
      recordMaterializations: (): number => this.fixture.recordMaterializations(),
    };
  }

  ngOnDestroy(): void {
    if (typeof window === 'undefined') return;
    delete (window as unknown as { __gpConformance?: unknown }).__gpConformance;
  }

  protected replaceColumns(): void {
    this.columns.set([
      { colId: 'score', field: 'score', headerName: 'Score', width: 120, cellDataType: 'number' },
      { colId: 'city', field: 'city', headerName: 'City', width: 140, cellDataType: 'text' },
      { colId: 'replacement', field: 'code', headerName: 'Replacement', width: 190, cellDataType: 'text' },
    ]);
  }

  protected reset(): void {
    this.mounted.set(false);
    this.rows.set(createRows());
    this.columns.set(createColumns());
    this.mode.set('object');
    this.editEvents.set(0);
    this.writeRejected.set(0);
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
    await this.grid?.core?.refresh();
  }

  protected onCellValueChanged(event: CellValueChangedEvent<unknown>): void {
    this.rows.update((rows) => rows.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row));
    this.editEvents.update((value) => value + 1);
  }

  protected onWriteRejected(_event: CellWriteRejectedEvent): void {
    this.writeRejected.update((value) => value + 1);
  }
}
