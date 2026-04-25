<script setup lang="ts">
import { ref, computed } from "vue";
import {
    GpGrid,
    useGridData,
    type ColumnDefinition,
    type HighlightingOptions,
} from "@gp-grid/vue";
import Currency from "./renderers/Currency.vue";
import StatusBadge from "./renderers/StatusBadge.vue";
import Bold from "./renderers/Bold.vue";
import Tags from "./renderers/Tags.vue";
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

// Column definitions
const columns: ColumnDefinition[] = [
    {
        field: "id",
        cellDataType: "number",
        hidden: true,
        width: 80,
        headerName: "ID",
        cellRenderer: Bold,
        pinned: "left",
    },
    { field: "name", cellDataType: "text", width: 150, headerName: "Name", pinned: "left" },
    {
        field: "age",
        cellDataType: "text",
        width: 130,
        headerName: "Age bucket",
        valueFormatter: (v) => {
            const n = typeof v === "number" ? v : Number(v);
            if (!Number.isFinite(n)) return "";
            if (n < 25) return "< 25";
            if (n < 40) return "25–39";
            if (n < 60) return "40–59";
            return "60+";
        },
    },
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
        cellRenderer: StatusBadge,
        valueFormatter: (v) => String(v ?? "").toUpperCase(),
    },
    {
        field: "salary",
        cellDataType: "number",
        width: 150,
        headerName: "Salary",
        cellRenderer: Currency,
        pinned: "right",
    },
    {
        field: "tags",
        cellDataType: "object",
        width: 200,
        headerName: "Tags",
        cellRenderer: Tags,
        sortable: true,
    },
];

// Create data source via useGridData
const { dataSource, updateRow } = useGridData<Person>(generateRowData(), {
    getRowId: (row) => row.id,
});

const rowIdToUpdate = ref(1);

const handleUpdateRow = () => {
    updateRow(rowIdToUpdate.value, {
        name: `Person ${names[getRandomInt(0, 3)]}`,
        salary: getRandomInt(30000, 150000),
    });
};

const highlightingProps = computed<HighlightingOptions<Person>>(() => ({
    computeRowClasses:
        highlightMode.value === "row"
            ? (context) => {
                  if (context.isHovered) return ["row-highlight"];
                  return [];
              }
            : undefined,
    computeColumnClasses:
        highlightMode.value === "column"
            ? (context) => {
                  if (context.isHovered) return ["column-highlight"];
                  return [];
              }
            : undefined,
    computeCellClasses:
        highlightMode.value === "cell"
            ? (context) => {
                  if (context.isHovered) return ["cell-highlight"];
                  return [];
              }
            : undefined,
}));
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

    <h2 class="subtitle">Large Dataset Demo (1.5M rows)</h2>

    <!-- Highlight Mode Switcher -->
    <div class="mode-switcher">
        <span class="mode-label">Highlight Mode:</span>
        <button
            v-for="mode in ['row', 'column', 'cell'] as const"
            :key="mode"
            @click="highlightMode = mode"
            :class="['mode-btn', { active: highlightMode === mode }]"
        >
            {{ mode.charAt(0).toUpperCase() + mode.slice(1) }} Hover
        </button>
    </div>

    <div class="grid-container">
        <GpGrid
            :row-drag-entire-row="true"
            :highlighting="highlightingProps"
            :columns="columns"
            :data-source="dataSource"
            :row-height="36"
            :header-height="40"
            :dark-mode="true"
            :row-grouping="{ columns: ['status', 'name'], defaultExpandedDepth: 1 }"
        />
    </div>

    <div class="card">
        <input
            type="number"
            :value="rowIdToUpdate"
            @input="
                (e) =>
                    (rowIdToUpdate = Number(
                        (e.target as HTMLInputElement).value,
                    ))
            "
            :min="1"
            :max="1500000"
            class="row-id-input"
        />
        <button class="update-row-btn" @click="handleUpdateRow">
            Update Row {{ rowIdToUpdate }}
        </button>
        <p class="hint">
            Double-click on cells to edit (Email column is editable)
        </p>
    </div>

    <p class="read-the-docs">Click on the Vite and Vue logos to learn more</p>
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

.row-id-input {
    width: 100px;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #4b5563;
    background-color: #1f2937;
    color: #f3f4f6;
}

.update-row-btn {
    background-color: #6366f1;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-weight: 500;
}

.update-row-btn:hover {
    background-color: #4f46e5;
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
.gp-grid-row.row-highlight,
.gp-grid-row.row-highlight .gp-grid-cell {
    background-color: rgba(59, 130, 246, 0.3) !important;
}

.gp-grid-cell.column-highlight {
    background-color: rgba(16, 185, 129, 0.3) !important;
}

.gp-grid-cell.cell-highlight {
    background-color: rgba(245, 158, 11, 0.5) !important;
}
</style>
