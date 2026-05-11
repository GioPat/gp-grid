# Integrating gp-grid in a Vue 3 app

This file is the Vue-specific reference. Cross-framework concepts (column shape, data source choice, features, programmatic API, gotchas) live in `SKILL.md` — read that first if you haven't.

## Install

```bash
pnpm add @gp-grid/vue       # or npm install / yarn add / bun add
```

Peer requirements: Vue 3.4+, TypeScript 5+ recommended.

Import the stylesheet **once** at the app entry point:

```ts
// main.ts
import "@gp-grid/vue/dist/styles.css";
```

## Minimal grid

```vue
<script setup lang="ts">
import { GpGrid, type ColumnDefinition } from "@gp-grid/vue";

interface Person {
  id: number;
  name: string;
  age: number;
}

const columns: ColumnDefinition[] = [
  { field: "id",   cellDataType: "number", width: 80,  headerName: "ID" },
  { field: "name", cellDataType: "text",   width: 200, headerName: "Name" },
  { field: "age",  cellDataType: "number", width: 100, headerName: "Age" },
];

const rows: Person[] = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
];
</script>

<template>
  <div style="width: 100%; height: 400px">
    <GpGrid :columns="columns" :row-data="rows" :row-height="36" />
  </div>
</template>
```

The component is the default export of `@gp-grid/vue`, also re-exported as `GpGrid`. Either name works. The wrapping element must have explicit dimensions.

Note the prop casing: `<GpGrid :row-data="…" :row-height="…">` (kebab-case in template) maps to `rowData` / `rowHeight` (camelCase) in TypeScript.

## Mutable data — `useGridData`

```vue
<script setup lang="ts">
import { GpGrid, useGridData, type ColumnDefinition } from "@gp-grid/vue";

interface Person { id: number; name: string; age: number }

const initial: Person[] = [/* ... */];

const { dataSource, updateRow, addRows, removeRows, updateCell } =
  useGridData<Person>(initial, { getRowId: (row) => row.id });

const handleAdd = () => addRows([{ id: 99, name: "Carol", age: 28 }]);
</script>

<template>
  <div style="width: 100%; height: 400px">
    <GpGrid :columns="columns" :data-source="dataSource" :row-height="36" />
  </div>
  <button @click="updateRow(1, { age: 31 })">+1 Alice age</button>
  <button @click="handleAdd">Add</button>
</template>
```

The composable's `dataSource` is a stable reference for the lifetime of the component. `getRowId` is required for any mutation.

## Server data — `createServerDataSource`

```vue
<script setup lang="ts">
import { computed } from "vue";
import {
  GpGrid,
  createServerDataSource,
  type ColumnDefinition,
  type DataSourceRequest,
  type DataSourceResponse,
} from "@gp-grid/vue";

interface User { id: number; name: string; email: string }

const fetchUsers = async (
  req: DataSourceRequest,
): Promise<DataSourceResponse<User>> => {
  // DataSourceRequest exposes `range: { startRow, endRow }` (endRow exclusive),
  // NOT a `pagination` field. Derive page/pageSize from the range.
  const pageSize = req.range.endRow - req.range.startRow;
  const pageIndex = Math.floor(req.range.startRow / pageSize);
  const params = new URLSearchParams({
    page: String(pageIndex),
    pageSize: String(pageSize),
  });
  if (req.sort?.length) {
    params.set("sortBy", req.sort.map((s) => `${s.colId}:${s.direction}`).join(","));
  }
  if (req.filter) {
    // req.filter is Record<string, ColumnFilterModel> — read .conditions[0].value, NOT the model itself.
    for (const [field, model] of Object.entries(req.filter)) {
      const value = model.conditions[0]?.value;
      if (value !== undefined) params.set(`f_${field}`, String(value));
    }
  }
  const r = await fetch(`/api/users?${params}`);
  const data = await r.json();
  return { rows: data.items, totalRows: data.total };
};

const dataSource = computed(() => createServerDataSource<User>(fetchUsers));
</script>
```

Use `computed` (or `shallowRef` initialized once) so the data source identity is stable. Recreating it on every render destroys grid state.

## Custom renderers

Vue renderers can be defined in **two** styles. Both are valid; pick whichever is more natural for the renderer.

### As a render function

```vue
<script setup lang="ts">
import { h } from "vue";
import {
  GpGrid,
  type ColumnDefinition,
  type CellRendererParams,
  type VueCellRenderer,
} from "@gp-grid/vue";

const cellRenderers: Record<string, VueCellRenderer> = {
  currency: (params) =>
    h(
      "span",
      { style: { color: "#047857", fontWeight: 600 } },
      `$${(params.value as number).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    ),
  bold: (params) => h("strong", String(params.value ?? "")),
};

const columns: ColumnDefinition[] = [
  { field: "salary", cellDataType: "number", width: 120, cellRenderer: "currency" },
  { field: "name",   cellDataType: "text",   width: 150, cellRenderer: "bold" },
];
</script>

<template>
  <GpGrid
    :columns="columns"
    :row-data="rows"
    :row-height="36"
    :cell-renderers="cellRenderers"
  />
</template>
```

### As a Vue component (.vue SFC)

`@gp-grid/vue`'s `ColumnDefinition` widens the renderer fields to **also** accept Vue components directly. The component receives the renderer params as props. This is the cleanest pattern for non-trivial renderers.

```vue
<!-- StatusBadge.vue -->
<script setup lang="ts">
import type { CellRendererParams } from "@gp-grid/vue";

const props = defineProps<{
  value: CellRendererParams["value"];
  rowData: CellRendererParams["rowData"];
  column: CellRendererParams["column"];
  rowIndex: CellRendererParams["rowIndex"];
  colIndex: CellRendererParams["colIndex"];
  isActive: CellRendererParams["isActive"];
  isSelected: CellRendererParams["isSelected"];
  isEditing: CellRendererParams["isEditing"];
}>();

const tone = computed(() => {
  switch (props.value) {
    case "active":   return "#16a34a";
    case "inactive": return "#dc2626";
    default:         return "#6b7280";
  }
});
</script>

<template>
  <span :style="{ color: tone, fontWeight: 600 }">{{ value }}</span>
</template>
```

```vue
<!-- Parent.vue -->
<script setup lang="ts">
import StatusBadge from "./StatusBadge.vue";
import type { ColumnDefinition } from "@gp-grid/vue";

const columns: ColumnDefinition[] = [
  // Pass the imported component directly. No registry needed.
  { field: "status", cellDataType: "text", width: 120, cellRenderer: StatusBadge },
];
</script>
```

Use this pattern any time you need template syntax, scoped styles, lifecycle, or composables inside a renderer. See `playgrounds/vite-vue/src/renderers/*` for working examples (`Currency.vue`, `StatusBadge.vue`, `Bold.vue`, `Tags.vue`, `AgeBucket.vue`).

### Edit renderers

`EditRendererParams` extends `CellRendererParams` with `initialValue`, `onValueChange`, `onCommit`, `onCancel`.

Render-function form:

```ts
const editRenderers: Record<string, VueEditRenderer> = {
  prioritySelect: (params) =>
    h(
      "select",
      {
        autofocus: true,
        value: params.initialValue as string,
        onChange: (e: Event) => params.onValueChange((e.target as HTMLSelectElement).value),
        onBlur: () => params.onCommit(),
        onKeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter") params.onCommit();
          if (e.key === "Escape") params.onCancel();
        },
      },
      [
        h("option", { value: "low" }, "Low"),
        h("option", { value: "medium" }, "Medium"),
        h("option", { value: "high" }, "High"),
      ],
    ),
};
```

SFC form: define a component that receives `EditRendererParams` as props and emits via `params.onValueChange` / `params.onCommit` / `params.onCancel`. Useful for editors that need template syntax or refs (e.g., focus management with `ref` + `onMounted`).

### Header renderers

`VueHeaderRenderer = (params: HeaderRendererParams) => VNode | string | null` or a Vue component. `HeaderRendererParams` exposes `column`, `colIndex`, `sortDirection`, `sortIndex`, `onSort(direction, addToExisting)`.

## Listening to changes

```vue
<template>
  <GpGrid
    :columns="columns"
    :data-source="dataSource"
    :row-height="36"
    :get-row-id="(row) => row.id"
    :on-cell-value-changed="(e) => console.log(e.field, e.oldValue, '→', e.newValue)"
    :on-row-drag-end="(from, to) => console.log('row', from, '→', to)"
    :on-column-resized="(colIndex, newWidth) => persist(colIndex, newWidth)"
    :on-column-moved="(fromIndex, toIndex) => persistOrder(fromIndex, toIndex)"
  />
</template>
```

`getRowId` is required when `onCellValueChanged` is set.

## Programmatic API

The component exposes its `core` via `defineExpose`. Bind a template ref:

```vue
<script setup lang="ts">
import { ref, type ShallowRef } from "vue";
import { GpGrid, GridCore } from "@gp-grid/vue";

const gridRef = ref<{ core: ShallowRef<GridCore | null> } | null>(null);

const sortByName = () => {
  gridRef.value?.core.value?.setSort("name", "asc", false);
};
</script>

<template>
  <GpGrid ref="gridRef" :columns="columns" :data-source="dataSource" :row-height="36" />
  <button @click="sortByName">Sort by name</button>
</template>
```

`core` is a `ShallowRef<GridCore | null>` (it's null before mount and after unmount), so unwrap with `.value`. Methods are listed in `SKILL.md` ("Programmatic API").

## Highlighting

```vue
<script setup lang="ts">
import { computed } from "vue";
import { GpGrid, type HighlightingOptions } from "@gp-grid/vue";

const highlighting = computed<HighlightingOptions>(() => ({
  computeRowClasses: (ctx) => (ctx.isHovered ? ["row-highlight"] : []),
  computeColumnClasses: (ctx) => (ctx.isHovered ? ["col-highlight"] : []),
}));
</script>

<template>
  <GpGrid
    :columns="columns"
    :data-source="dataSource"
    :row-height="36"
    :highlighting="highlighting"
  />
</template>

<style>
/* MUST be unscoped — gp-grid renders outside Vue's scoped style boundary */
.row-highlight { background-color: rgba(59, 130, 246, 0.2) !important; }
.col-highlight { background-color: rgba(16, 185, 129, 0.2) !important; }
</style>
```

Both callbacks together = Excel-style crosshair. The `<style>` tag with the highlight classes **must not** be `scoped`.

## Reactive `dataSource` and `rowData` swaps

The wrapper watches both props. If either changes, it calls `core.setDataSource(newDs)` internally — sort, filter, scroll, and selection are preserved. Just keep references stable (or change them intentionally).

## All `<GpGrid>` props (cheatsheet)

| Prop (kebab in template) | Type | Default |
|---|---|---|
| `:columns` | `ColumnDefinition[]` | required |
| `:data-source` | `DataSource<TData>` | — |
| `:row-data` | `TData[]` | — |
| `:row-height` | `number` | required |
| `:header-height` | `number` | `rowHeight` |
| `:overscan` | `number` | `3` |
| `:row-loading` | `RowLoadingOptions` | — |
| `:sorting-enabled` | `boolean` | `true` |
| `:dark-mode` | `boolean` | `false` |
| `:wheel-dampening` | `number` | `0.1` |
| `:cell-renderers` | `Record<string, VueCellRenderer>` | `{}` |
| `:edit-renderers` | `Record<string, VueEditRenderer>` | `{}` |
| `:header-renderers` | `Record<string, VueHeaderRenderer>` | `{}` |
| `:cell-renderer` | `VueCellRenderer` | — |
| `:edit-renderer` | `VueEditRenderer` | — |
| `:header-renderer` | `VueHeaderRenderer` | — |
| `:initial-width` / `:initial-height` | `number` | — |
| `:highlighting` | `HighlightingOptions<TData>` | — |
| `:get-row-id` | `(row: TData) => RowId` | — |
| `:on-cell-value-changed` | `(e: CellValueChangedEvent<TData>) => void` | — |
| `:loading-component` | `Component<{ isLoading: boolean }>` | spinner |
| `:row-drag-entire-row` | `boolean` | `false` |
| `:on-row-drag-end` | `(src, tgt) => void` | — |
| `:on-column-resized` | `(colIndex, newWidth) => void` | — |
| `:on-column-moved` | `(from, to) => void` | — |

## Vue-specific gotchas

- **Highlight CSS in `<style scoped>`**: won't apply. Move it to an unscoped block or a global stylesheet.
- **Server-data ds without `computed` / stable ref**: every render recreates the data source and resets the grid. Wrap in `computed` or initialize once with `shallowRef`.
- **`ref="gridRef"` typing**: the exposed `core` is a `ShallowRef<GridCore | null>` — unwrap with `.value`. Use `ShallowRef` to avoid deep reactivity over the core (which would be expensive).
- **SSR / Nuxt**: pass `:initial-width` / `:initial-height` so the server render isn't 0×0. `ResizeObserver` is gated by a `typeof` check.
- **Renderer-as-component prop typing**: `ColumnDefinition` from `@gp-grid/vue` widens the renderer fields to accept Components directly. If you import `ColumnDefinition` from `@gp-grid/core`, you'll lose this — use the one from `@gp-grid/vue`.

## Working playground

A complete working example (1.5M rows, SFC-based renderers, mutations via `useGridData`, highlighting, dark mode, row drag) lives at `playgrounds/vite-vue/src/App.vue`. Renderers in `playgrounds/vite-vue/src/renderers/`. Read it whenever you need a real end-to-end pattern.
