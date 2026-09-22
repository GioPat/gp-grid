<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { GpGrid, createColumnarDataSource } from "@gp-grid/vue";
import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnLayoutMode,
  GridCore,
  RowDragEndEvent,
} from "@gp-grid/vue";
import {
  createGeometryHooks,
  createLargeColumnarColumns,
  createLargeColumnarSource,
  createNarrowColumns,
  createWideColumns,
  createWideSource,
} from "./conformance-geometry";

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
  name: `Row ${index.toString().padStart(3, "0")}`,
  city: `City ${index % 11}`,
  score: index * 3,
  team: `Team ${index % 7}`,
  status: index % 2 === 0 ? "active" : "inactive",
  note: `Note ${index}`,
  code: `C-${index.toString().padStart(4, "0")}`,
}));

const createColumns = (): ColumnDefinition[] => [
  { colId: "id", field: "id", headerName: "ID", width: 90, cellDataType: "number", sortable: true },
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", sortable: true, filterable: true, editable: true },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
  { colId: "team", field: "team", headerName: "Team", width: 150, cellDataType: "text" },
  { colId: "status", field: "status", headerName: "Status", width: 130, cellDataType: "text" },
  { colId: "note", field: "note", headerName: "Note", width: 210, cellDataType: "text" },
  { colId: "code", field: "code", headerName: "Code", width: 160, cellDataType: "text" },
];

/** Same columns, with a formatter so raw and displayed values differ. */
const createColumnarColumns = (): ColumnDefinition[] =>
  createColumns().map((column) =>
    column.field === "score"
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
        if (typeof property === "string" && /^\d+$/.test(property)) {
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
    name[index] = `Row ${index.toString().padStart(3, "0")}`;
    city[index] = `City ${index % 11}`;
    score[index] = index * 3;
    team[index] = `Team ${index % 7}`;
    status[index] = index % 2 === 0 ? "active" : "inactive";
    note[index] = `Note ${index}`;
    code[index] = `C-${index.toString().padStart(4, "0")}`;
  }
  const source = createColumnarDataSource({
    rowCount: ROW_COUNT,
    getRowId: (row) => id[row]!,
    fields: [
      { field: "id", data: id },
      { field: "name", data: name },
      { field: "city", data: city },
      { field: "score", data: score },
      { field: "team", data: team },
      { field: "status", data: status },
      { field: "note", data: note },
      { field: "code", data: code },
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

const rows = ref<ConformanceRow[]>(createRows());
const columns = ref<ColumnDefinition[]>(createColumns());
const columnarColumns = ref<ColumnDefinition[]>(createColumnarColumns());
const fixture = createColumnarFixture();
const largeColumnarSource = ref<ReturnType<typeof createLargeColumnarSource> | null>(null);
const mode = ref<"object" | "columnar">("object");
const revision = ref(0);
const mounted = ref(true);
const generation = ref(0);
const rtl = ref(false);
const editEvents = ref(0);
const writeRejected = ref(0);
const columnState = ref<ColumnStateUpdate[] | undefined>(undefined);
const columnLayout = ref<ColumnLayoutMode>("fit");
const hostWidth = ref(600);
const gridRef = ref<InstanceType<typeof GpGrid> | null>(null);
const eventCounts = { resized: 0, moved: 0, dragged: 0, pinned: 0 };
const coreTokens = new WeakMap<object, number>();
let nextCoreToken = 1;

const coreOf = (): GridCore<unknown> | undefined =>
  (gridRef.value as unknown as { core?: GridCore<unknown> } | null)?.core;

const readCoreToken = (): number => {
  const core = coreOf();
  if (!core) return -1;
  const existing = coreTokens.get(core);
  if (existing !== undefined) return existing;
  const token = nextCoreToken;
  nextCoreToken += 1;
  coreTokens.set(core, token);
  return token;
};

const metrics = computed(() => JSON.stringify({
  generation: generation.value,
  editEvents: editEvents.value,
  writeRejected: writeRejected.value,
  mode: mode.value,
  revision: revision.value,
}));

const replaceColumns = (): void => {
  columns.value = [
    { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
    { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
    { colId: "replacement", field: "code", headerName: "Replacement", width: 190, cellDataType: "text" },
  ];
};

const useNarrowColumns = (): void => {
  columns.value = createNarrowColumns();
};

const useLargeColumnar = (): void => {
  mode.value = "columnar";
  columnarColumns.value = createLargeColumnarColumns();
  largeColumnarSource.value = createLargeColumnarSource();
  generation.value += 1;
  revision.value = fixture.source.revision;
};

/** Wide fixtures bind an accessor source: no per-row storage for 10k columns. */
const useWideColumns = (count: number): void => {
  mode.value = "columnar";
  columnarColumns.value = createWideColumns(count);
  largeColumnarSource.value = createWideSource(count);
  generation.value += 1;
};

const pinColumns = (): void => {
  columnState.value = [
    { columnId: "id", pinned: "start" },
    { columnId: "name", pinned: "start" },
    { columnId: "code", pinned: "end" },
  ];
};

const unpinAll = (): void => {
  columnState.value = undefined;
  const core = coreOf();
  for (const column of core?.getColumns() ?? []) {
    core?.setColumnPinned(column.colId ?? column.field, null);
  }
};

const toggleColumnLayout = (): void => {
  columnLayout.value = columnLayout.value === "fit" ? "fixed" : "fit";
};

const resizeHost = (): void => {
  hostWidth.value = hostWidth.value === 600 ? 800 : 600;
};

const hideColumn = (): void => {
  columnState.value = [...(columnState.value ?? []), { columnId: "id", hidden: true }];
};

const reset = (): void => {
  rows.value = createRows();
  columns.value = createColumns();
  columnarColumns.value = createColumnarColumns();
  columnState.value = undefined;
  columnLayout.value = "fit";
  hostWidth.value = 600;
  mode.value = "object";
  mounted.value = true;
  rtl.value = false;
  generation.value += 1;
  editEvents.value = 0;
  writeRejected.value = 0;
  eventCounts.resized = 0;
  eventCounts.moved = 0;
  eventCounts.dragged = 0;
  eventCounts.pinned = 0;
};

const remount = async (): Promise<void> => {
  mounted.value = false;
  await nextTick();
  generation.value += 1;
  mounted.value = true;
};

const toggleRtl = async (): Promise<void> => {
  rtl.value = !rtl.value;
  await remount();
};

const useColumnar = (): void => {
  mode.value = "columnar";
  generation.value += 1;
  revision.value = fixture.source.revision;
};

const useObject = (): void => {
  mode.value = "object";
  generation.value += 1;
};

/** In-place same-array update followed by an explicit revision refresh. */
const bumpRevision = async (): Promise<void> => {
  fixture.data.name[0] = "Row revised";
  fixture.data.score[0] = 7;
  const next = fixture.source.revision + 1;
  fixture.source.setRevision(next);
  revision.value = next;
  const exposed = gridRef.value as unknown as { core?: { refresh(): Promise<void> } } | null;
  await exposed?.core?.refresh();
};

const onCellValueChanged = (event: CellValueChangedEvent<unknown>): void => {
  rows.value = rows.value.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row);
  editEvents.value += 1;
};

const onWriteRejected = (_event: CellWriteRejectedEvent): void => {
  writeRejected.value += 1;
};

const onColumnResized = (_event: ColumnResizedEvent): void => {
  eventCounts.resized += 1;
};
const onColumnMoved = (_event: ColumnMovedEvent): void => {
  eventCounts.moved += 1;
};
const onRowDragEnd = (_event: RowDragEndEvent): void => {
  eventCounts.dragged += 1;
};
const onColumnPinned = (_event: ColumnPinnedEvent): void => {
  eventCounts.pinned += 1;
};

const applyColumnState = (): void => {
  columnState.value = [{ columnId: "city", width: 260 }];
};
const resetColumnState = (): void => {
  columnState.value = undefined;
  coreOf()?.resetColumnState();
};
const applySort = (): void => {
  void coreOf()?.setSort("score", "asc");
};
const applyFilter = (): void => {
  void coreOf()?.setFilter("city", "City 1");
};
const moveColumn = (): void => {
  coreOf()?.moveColumn(0, 2);
};
const dragRow = (): void => {
  coreOf()?.commitRowDrag(0, 1);
};

if (typeof window !== "undefined") {
  (window as unknown as { __gpConformance?: unknown }).__gpConformance = {
    getCellValue: (row: number, col: number): CellValue => coreOf()?.getCellValue(row, col) ?? null,
    getFieldValue: (row: number, field: string): CellValue => coreOf()?.getFieldValue(row, field) ?? null,
    revision: (): number => fixture.source.revision,
    sourceReads: (): number => fixture.reads(),
    sourceDistinctRows: (): number => fixture.distinctRows(),
    resetSourceReads: (): void => fixture.resetReads(),
    recordMaterializations: (): number => fixture.recordMaterializations(),
    coreToken: readCoreToken,
    columnIds: (): string[] =>
      coreOf()?.getColumns().map((column: ColumnDefinition) => column.colId ?? column.field) ?? [],
    columnState: (): ColumnStateSnapshot[] => coreOf()?.getColumnState() ?? [],
    sortColumn: (): string | null => coreOf()?.getSortModel()[0]?.colId ?? null,
    filterCount: (): number => Object.keys(coreOf()?.getFilterModel() ?? {}).length,
    eventCounts: () => ({ ...eventCounts }),
    resetEventCounts: (): void => {
      eventCounts.resized = 0;
      eventCounts.moved = 0;
      eventCounts.dragged = 0;
      eventCounts.pinned = 0;
    },
    useWideColumns,
    ...createGeometryHooks(() => coreOf()),
  };
}
</script>

<template>
  <main data-conformance-framework="vue" style="width: 620px; margin: 16px">
    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
      <button data-testid="reset" @click="reset">Reset</button>
      <button data-testid="remount" @click="remount">Remount</button>
      <button data-testid="toggle-rtl" @click="toggleRtl">Toggle RTL</button>
      <button data-testid="replace-columns" @click="replaceColumns">Replace columns</button>
      <button data-testid="apply-column-state" @click="applyColumnState">Apply column state</button>
      <button data-testid="reset-column-state" @click="resetColumnState">Reset column state</button>
      <button data-testid="apply-sort" @click="applySort">Apply sort</button>
      <button data-testid="apply-filter" @click="applyFilter">Apply filter</button>
      <button data-testid="move-column" @click="moveColumn">Move column</button>
      <button data-testid="drag-row" @click="dragRow">Drag row</button>
      <button data-testid="use-columnar" @click="useColumnar">Use columnar</button>
      <button data-testid="use-object" @click="useObject">Use object</button>
      <button data-testid="bump-revision" @click="bumpRevision">Bump revision</button>
      <button data-testid="use-narrow-columns" @click="useNarrowColumns">Narrow columns</button>
      <button data-testid="use-large-columnar" @click="useLargeColumnar">Large columnar</button>
      <button data-testid="use-wide-columns" @click="useWideColumns(1000)">Wide columns</button>
      <button data-testid="pin-columns" @click="pinColumns">Pin columns</button>
      <button data-testid="unpin-all" @click="unpinAll">Unpin all</button>
      <button data-testid="toggle-column-layout" @click="toggleColumnLayout">Toggle layout</button>
      <button data-testid="resize-host" @click="resizeHost">Resize host</button>
      <button data-testid="hide-column" @click="hideColumn">Hide column</button>
      <output data-testid="metrics">{{ metrics }}</output>
    </div>
    <div data-testid="grid-host" :dir="rtl ? 'rtl' : 'ltr'" :style="{ width: `${hostWidth}px`, height: '360px' }">
      <GpGrid
        v-if="mounted"
        ref="gridRef"
        :key="generation"
        :columns="mode === 'columnar' ? columnarColumns : columns"
        :column-state="columnState"
        :column-layout="columnLayout"
        :data-source="mode === 'columnar' ? (largeColumnarSource ?? fixture.source) : undefined"
        :row-data="mode === 'columnar' ? undefined : rows"
        :row-height="32"
        :header-height="36"
        :get-row-id="(row: unknown) => (row as ConformanceRow).id"
        :on-cell-value-changed="onCellValueChanged"
        :on-write-rejected="onWriteRejected"
        :on-column-resized="onColumnResized"
        :on-column-moved="onColumnMoved"
        :on-row-drag-end="onRowDragEnd"
        :on-column-pinned="onColumnPinned"
      />
    </div>
  </main>
</template>
