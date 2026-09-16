<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { GpGrid } from "@gp-grid/vue";
import type { CellValueChangedEvent, ColumnDefinition } from "@gp-grid/vue";

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

const createRows = (): ConformanceRow[] => Array.from({ length: 200 }, (_, index) => ({
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

const rows = ref<ConformanceRow[]>(createRows());
const columns = ref<ColumnDefinition[]>(createColumns());
const mounted = ref(true);
const generation = ref(0);
const editEvents = ref(0);
const metrics = computed(() => JSON.stringify({ generation: generation.value, editEvents: editEvents.value }));

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
  mounted.value = true;
  generation.value += 1;
  editEvents.value = 0;
};

const remount = async (): Promise<void> => {
  mounted.value = false;
  await nextTick();
  generation.value += 1;
  mounted.value = true;
};

const onCellValueChanged = (event: CellValueChangedEvent<unknown>): void => {
  rows.value = rows.value.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row);
  editEvents.value += 1;
};
</script>

<template>
  <main data-conformance-framework="vue" style="width: 620px; margin: 16px">
    <div style="display: flex; gap: 8px; margin-bottom: 8px">
      <button data-testid="reset" @click="reset">Reset</button>
      <button data-testid="remount" @click="remount">Remount</button>
      <button data-testid="replace-columns" @click="replaceColumns">Replace columns</button>
      <output data-testid="metrics">{{ metrics }}</output>
    </div>
    <div data-testid="grid-host" style="width: 600px; height: 360px">
      <GpGrid
        v-if="mounted"
        :key="generation"
        :columns="columns"
        :row-data="rows"
        :row-height="32"
        :header-height="36"
        :get-row-id="(row: unknown) => (row as ConformanceRow).id"
        :on-cell-value-changed="onCellValueChanged"
      />
    </div>
  </main>
</template>
