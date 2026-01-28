<script setup lang="ts">
import { h, ref, computed } from "vue";
import {
  GpGrid,
  type ColumnDefinition,
  type CellRendererParams,
  type VueCellRenderer,
  type HighlightingOptions,
} from "@gp-grid/vue";

type HighlightMode = "row" | "column" | "cell";
const highlightMode = ref<HighlightMode>("row");

// Types
interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
  status: "active" | "inactive" | "pending";
  salary: number;
  tags: string[];
}

// Helper functions
function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const names = ["Ennio", "Giovanni", "Mario", "Giuseppe"];
const statuses: Person["status"][] = ["active", "inactive", "pending"];

// Available tag options
const tagOptions = [
  { value: "vip", label: "VIP" },
  { value: "new", label: "New" },
  { value: "priority", label: "Priority" },
  { value: "archived", label: "Archived" },
  { value: "verified", label: "Verified" },
];

// Helper to get random tags
const getRandomTags = (): string[] => {
  const numTags = getRandomInt(0, 3);
  const shuffled = [...tagOptions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, numTags).map((opt) => opt.value);
};

// Generate sample data (1.5M rows)
const generateRowData = (): Person[] =>
  Array.from({ length: 1500000 }, (_, i) => ({
    id: i + 1,
    name: `Person ${names[getRandomInt(0, 2)]}`,
    age: getRandomInt(18, 90),
    email: `person${i + 1}@example.com`,
    status: statuses[getRandomInt(0, 2)],
    salary: getRandomInt(30000, 150000),
    tags: getRandomTags(),
  }));

// Cell renderers using Vue's h() function
const cellRenderers: Record<string, VueCellRenderer<Person>> = {
  // Currency formatter
  currency: (params: CellRendererParams<Person>) => {
    const value = params.value as number;
    return h(
      "span",
      { style: { color: "#047857", fontWeight: "600" } },
      `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    );
  },

  // Status badge
  statusBadge: (params: CellRendererParams<Person>) => {
    const status = params.value as Person["status"];
    const colors = {
      active: { bg: "#dcfce7", text: "#166534" },
      inactive: { bg: "#fee2e2", text: "#991b1b" },
      pending: { bg: "#fef3c7", text: "#92400e" },
    };
    const color = colors[status];

    return h(
      "span",
      {
        style: {
          backgroundColor: color.bg,
          color: color.text,
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: "600",
        },
      },
      status.toUpperCase()
    );
  },

  // Bold text renderer
  bold: (params: CellRendererParams<Person>) => {
    return h("strong", {}, String(params.value ?? ""));
  },

  // Tags renderer
  tags: (params: CellRendererParams<Person>) => {
    const tags = (params.value as string[]) || [];
    if (tags.length === 0) {
      return h(
        "span",
        { style: { color: "#6b7280", fontStyle: "italic" } },
        "No tags"
      );
    }
    return h(
      "div",
      {
        style: {
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          maxHeight: "100%",
          overflowY: "auto",
          alignContent: "flex-start",
          padding: "2px 0",
        },
      },
      tags.map((tag) =>
        h(
          "span",
          {
            key: tag,
            style: {
              backgroundColor: "#3b82f6",
              color: "#ffffff",
              padding: "2px 6px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "500",
              flexShrink: 0,
            },
          },
          tag.toUpperCase()
        )
      )
    );
  },
};

// Column definitions
const columns: ColumnDefinition[] = [
  {
    field: "id",
    cellDataType: "number",
    hidden: true,
    width: 80,
    headerName: "ID",
    cellRenderer: "bold",
  },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "age", cellDataType: "number", width: 110, headerName: "Age" },
  {
    field: "email",
    cellDataType: "text",
    width: 250,
    headerName: "Email",
    editable: true,
  },
  {
    field: "status",
    cellDataType: "text",
    width: 120,
    headerName: "Status",
    cellRenderer: "statusBadge",
  },
  {
    field: "salary",
    cellDataType: "number",
    width: 150,
    headerName: "Salary",
    cellRenderer: "currency",
  },
  {
    field: "tags",
    cellDataType: "object",
    width: 200,
    headerName: "Tags",
    cellRenderer: "tags",
    sortable: true,
  },
];

// Create row data (once, not reactive)
const rowData = generateRowData();

const highlightingProps = computed<HighlightingOptions<Person>>(() => ({
  computeRowClasses: highlightMode.value === "row" ? (context) => {
    if (context.isHovered) return ["row-highlight"];
    return [];
  } : undefined,
  computeColumnClasses: highlightMode.value === "column" ? (context) => {
    if (context.isHovered) return ["column-highlight"];
    return [];
  } : undefined,
  computeCellClasses: highlightMode.value === "cell" ? (context) => {
    if (context.isHovered) return ["cell-highlight"];
    return [];
  } : undefined,
}));

// Handler to demonstrate reading all grid data
const handleGetAllData = () => {
  console.log("=== All Grid Data ===");
  console.log(`Total rows: ${rowData.length}`);

  // Show first 10 rows with their tags
  console.log("First 10 rows with tags:");
  rowData.slice(0, 10).forEach((row) => {
    console.log(`  ID ${row.id}: ${row.name} - Tags: [${row.tags.join(", ")}]`);
  });
  // Count rows by tag
  const tagCounts: Record<string, number> = {};
  rowData.forEach((row) => {
    row.tags.forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  console.log("Tag distribution:", tagCounts);

  alert("Data logged to console. Open DevTools to see the output.");
};
</script>

<template>
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="/vite.svg" class="logo" alt="Vite logo" />
    </a>
    <a href="https://vuejs.org/" target="_blank">
      <img src="./assets/vue.svg" class="logo vue" alt="Vue logo" />
    </a>
  </div>
  <h1>GP Grid Vue Demo</h1>

  <h2 class="subtitle">Large Dataset Demo (1.5M rows) - {{ rowData.length }} rows loaded</h2>

  <!-- Highlight Mode Switcher -->
  <div class="mode-switcher">
    <span class="mode-label">Highlight Mode:</span>
    <button
      v-for="mode in (['row', 'column', 'cell'] as const)"
      :key="mode"
      @click="highlightMode = mode"
      :class="['mode-btn', { active: highlightMode === mode }]"
    >
      {{ mode.charAt(0).toUpperCase() + mode.slice(1) }} Hover
    </button>
  </div>

  <div class="grid-container">
    <GpGrid
      :highlighting="highlightingProps"
      :columns="columns"
      :row-data="rowData"
      :row-height="36"
      :header-height="40"
      :dark-mode="true"
      :cell-renderers="cellRenderers"
    />
  </div>

  <div class="card">
    <button class="get-data-btn" @click="handleGetAllData">Get All Data</button>
    <p class="hint">Double-click on cells to edit (Email column is editable)</p>
  </div>

  <p class="read-the-docs">
    Click on the Vite and Vue logos to learn more
  </p>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}

.subtitle {
  margin-bottom: 16px;
  color: #f3f4f6;
}

.grid-container {
  width: 1000px;
  height: 400px;
}

.card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 2em;
}

.get-data-btn {
  background-color: #3b82f6;
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.get-data-btn:hover {
  background-color: #2563eb;
}

.hint {
  margin: 0;
  color: #9ca3af;
}

.read-the-docs {
  color: #888;
}

/* Highlight mode switcher */
.mode-switcher {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-label {
  color: #9ca3af;
  margin-right: 8px;
}

.mode-btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-weight: 400;
  background-color: #374151;
  color: #9ca3af;
}

.mode-btn.active {
  font-weight: 600;
  background-color: #3b82f6;
  color: white;
}
</style>

<style>
/* Highlight classes (global, not scoped) */
.row-highlight {
  background-color: rgba(59, 130, 246, 0.3) !important;
}

.column-highlight {
  background-color: rgba(16, 185, 129, 0.3) !important;
}

.cell-highlight {
  background-color: rgba(245, 158, 11, 0.5) !important;
}
</style>
