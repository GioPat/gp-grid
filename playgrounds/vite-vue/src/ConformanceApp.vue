<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { GpGrid, createColumnarDataSource } from "@gp-grid/vue";
import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
} from "@gp-grid/vue";

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
const columnarColumns = createColumnarColumns();
const fixture = createColumnarFixture();
const mode = ref<"object" | "columnar">("object");
const revision = ref(0);
const mounted = ref(true);
const generation = ref(0);
const editEvents = ref(0);
const writeRejected = ref(0);
const gridRef = ref<InstanceType<typeof GpGrid> | null>(null);

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

const reset = (): void => {
  rows.value = createRows();
  columns.value = createColumns();
  mode.value = "object";
  mounted.value = true;
  generation.value += 1;
  editEvents.value = 0;
  writeRejected.value = 0;
};

const remount = async (): Promise<void> => {
  mounted.value = false;
  await nextTick();
  generation.value += 1;
  mounted.value = true;
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

if (typeof window !== "undefined") {
  (window as unknown as { __gpConformance?: unknown }).__gpConformance = {
    getCellValue: (row: number, col: number): CellValue => {
      const exposed = gridRef.value as unknown as { core?: { getCellValue(row: number, col: number): CellValue } } | null;
      return exposed?.core?.getCellValue(row, col) ?? null;
    },
    getFieldValue: (row: number, field: string): CellValue => {
      const exposed = gridRef.value as unknown as { core?: { getFieldValue(row: number, field: string): CellValue } } | null;
      return exposed?.core?.getFieldValue(row, field) ?? null;
    },
    revision: (): number => fixture.source.revision,
    sourceReads: (): number => fixture.reads(),
    sourceDistinctRows: (): number => fixture.distinctRows(),
    resetSourceReads: (): void => fixture.resetReads(),
    recordMaterializations: (): number => fixture.recordMaterializations(),
  };
}
</script>

<template>
  <main data-conformance-framework="vue" style="width: 620px; margin: 16px">
    <div style="display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
      <button data-testid="reset" @click="reset">Reset</button>
      <button data-testid="remount" @click="remount">Remount</button>
      <button data-testid="replace-columns" @click="replaceColumns">Replace columns</button>
      <button data-testid="use-columnar" @click="useColumnar">Use columnar</button>
      <button data-testid="use-object" @click="useObject">Use object</button>
      <button data-testid="bump-revision" @click="bumpRevision">Bump revision</button>
      <output data-testid="metrics">{{ metrics }}</output>
    </div>
    <div data-testid="grid-host" style="width: 600px; height: 360px">
      <GpGrid
        v-if="mounted"
        ref="gridRef"
        :key="generation"
        :columns="mode === 'columnar' ? columnarColumns : columns"
        :data-source="mode === 'columnar' ? fixture.source : undefined"
        :row-data="mode === 'columnar' ? undefined : rows"
        :row-height="32"
        :header-height="36"
        :get-row-id="(row: unknown) => (row as ConformanceRow).id"
        :on-cell-value-changed="onCellValueChanged"
        :on-write-rejected="onWriteRejected"
      />
    </div>
  </main>
</template>
