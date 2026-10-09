<script setup lang="ts">
import { ref, computed } from "vue";
import {
    GpGrid,
    useGridData,
    createRowGrouping,
    type ColumnDefinition,
    type ColumnGroupChild,
    type HighlightingOptions,
    type GridCore,
    type GridLabels,
    type FrozenRowsState,
} from "@gp-grid/vue";
import Currency from "./renderers/Currency.vue";
import StatusBadge from "./renderers/StatusBadge.vue";
import Bold from "./renderers/Bold.vue";
import Tags from "./renderers/Tags.vue";
import AgeBucket from "./renderers/AgeBucket.vue";
type HighlightMode = "row" | "column" | "cell";
type FreezeCount = 0 | 1 | 3 | 5;
const highlightMode = ref<HighlightMode>("row");
const freezeCounts: FreezeCount[] = [0, 1, 3, 5];
const freezeCount = ref<FreezeCount>(0);
const frozenStatus = ref("0 of 0 rows frozen");
const gridRef = ref<InstanceType<typeof GpGrid> | null>(null);
const coreOf = (): GridCore<unknown> | undefined =>
    (gridRef.value as unknown as { core?: GridCore<unknown> } | null)?.core;

/** Row heights (PRD 006): identity commands through the exposed core. */
const tallRows = (): void => {
    coreOf()?.rowHeights.set([
        { rowId: 1, height: 48 },
        { rowId: 2, height: 64 },
        { rowId: 3, height: 96 },
    ]);
};
const resetRowHeights = (): void => {
    coreOf()?.rowHeights.reset();
};

/** Auto-fit (PRD 007): one-shot fits of the mounted cells. */
const fitColumns = (): void => {
    coreOf()?.columns.fit();
};
const fitRows = (): void => {
    coreOf()?.rowHeights.fit();
};

// Types
interface Person {
    id: number;
    name: string;
    age: number;
    bio: string;
    createdAt: Date;
    status: "active" | "inactive" | "pending";
    salary: number;
    tags: string[];
}

// Long bio strings pooled so the 1.5M-row dataset doesn't allocate millions of
// distinct strings. Each row references one of these by index modulo.
const bioPool: string[] = [
    "Seasoned backend engineer who spent the last decade chasing tail-latency outliers across distributed message brokers. Mentors junior engineers, writes too many internal docs, and is on a quiet mission to retire every YAML file in the company.",
    "Joined fresh out of a bootcamp three years ago and now leads the design system working group. Holds strong opinions about color tokens, accessible focus rings, and the perfect motion duration (always 180ms, never 200).",
    "Former data scientist turned product manager. Still keeps a Jupyter notebook open on the side. Argues that every roadmap should start with a histogram and end with a follow-up question.",
    "Lives in three time zones and is somehow always the first to reply on Slack. Hobbies include long walks, longer postmortems, and convincing reviewers that this PR is, in fact, small.",
    "Joined for the coffee, stayed for the codebase. Has opinions on monorepos, file organization, and whether `index.ts` should be allowed to re-export anything at all (it should not).",
    "Quietly rewrote the deployment pipeline over a long weekend and never told anyone — found out three months later when the on-call rotation noticed the alert volume had dropped by 80%.",
];

// Date pool: small set of timestamps reused across rows to keep memory flat.
const datePool: Date[] = Array.from(
    { length: 60 },
    (_, i) => new Date(Date.now() - i * 86400000 * 5),
);

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
        bio: bioPool[i % bioPool.length],
        createdAt: datePool[i % datePool.length],
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
    },
    { field: "name", editable: true, cellDataType: "text", width: 150, headerName: "Name" },
    {
        field: "age",
        cellDataType: "text",
        width: 150,
        headerName: "Age bucket",
        cellRenderer: AgeBucket,
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
        field: "bio",
        cellDataType: "text",
        width: 260,
        headerName: "Bio",
        distinctValues: bioPool,
        // wrapText: long text flows onto new lines (clipped to the fixed row
        // height) instead of truncating with an ellipsis.
        wrapText: true,
        // Not editable → double-click opens the read-only peek overlay
        // (once the Vue wrapper renders one — currently behaviour-only).
    },
    {
        field: "createdAt",
        cellDataType: "dateTime",
        width: 200,
        headerName: "Created",
        valueFormatter: (v) => (v instanceof Date ? v.toLocaleString() : ""),
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

// Three group levels over the demo columns: `id` stays ungrouped, `bio` sits
// one level shallower than `name` and `age`, and `Record` is two levels deep.
const demoColumnGroups: ColumnGroupChild[] = [
    "id",
    {
        groupId: "person",
        headerName: "Person",
        children: [
            {
                groupId: "profile",
                headerName: "Profile",
                children: [
                    { groupId: "basics", headerName: "Basics", children: ["name", "age"] },
                    "bio",
                ],
            },
        ],
    },
    {
        groupId: "record",
        headerName: "Record",
        children: [
            "createdAt",
            "status",
            { groupId: "compensation", headerName: "Compensation", children: ["salary", "tags"] },
        ],
    },
];

const DEMO_HEADER_HEIGHT = 40;
const tallBandHeights = [DEMO_HEADER_HEIGHT * 2];

/** Column groups (PRD 007): hierarchy and band heights, no remount. */
const grouped = ref(false);
const tallBand = ref(false);

// Row grouping (PRD 008): two dimensions, one `sum` and one `avg`, no remount.
const createDemoRowGrouping = () =>
    createRowGrouping({
        dimensions: [{ field: "status" }, { field: "name" }],
        measures: [
            { field: "salary", aggregate: "sum" },
            { field: "age", aggregate: "avg" },
        ],
        grandTotal: "top",
    });
const groupRows = ref(false);
const rowGrouping = computed(() => (groupRows.value ? createDemoRowGrouping() : null));
const expandAllGroups = (): void => {
    coreOf()?.rowGroups.setExpanded(null, true);
};

// Create data source via useGridData
const { dataSource, updateRow } = useGridData<Person>(generateRowData(), {
    getRowId: (row) => row.id,
});

const rowIdToUpdate = ref(1);

// Localized labels demo — override only what you need; the rest fall back to
// the English defaults.
const gridLabels: Partial<GridLabels> = {
    and: "E",
    filterTitle: "Filtra: {column}",
    apply: "Applica",
};

const handleUpdateRow = () => {
    updateRow(rowIdToUpdate.value, {
        name: `Person ${names[getRandomInt(0, 3)]}`,
        age: getRandomInt(18, 90),
        salary: getRandomInt(30000, 150000),
    });
};

const freezeRows = computed(() => ({ count: freezeCount.value }));

const handleFrozenRowsChanged = (state: FrozenRowsState) => {
    frozenStatus.value = `${state.effectiveCount} of ${state.requestedCount} rows frozen`;
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

    <!-- Frozen Rows Switcher -->
    <div class="mode-switcher">
        <span class="mode-label">Frozen Rows:</span>
        <button
            v-for="value in freezeCounts"
            :key="value"
            @click="freezeCount = value"
            :class="['mode-btn', { active: freezeCount === value }]"
        >
            {{ value }}
        </button>
        <span class="mode-label">{{ frozenStatus }}</span>
    </div>

    <!-- Row Heights (PRD 006): heights by identity, no remount -->
    <div class="mode-switcher">
        <span class="mode-label">Row heights:</span>
        <button class="mode-btn" @click="tallRows">Tall rows</button>
        <button class="mode-btn" @click="resetRowHeights">Reset heights</button>
        <button class="mode-btn" @click="fitColumns">Fit columns</button>
        <button class="mode-btn" @click="fitRows">Fit rows</button>
        <button
            :class="['mode-btn', { active: grouped }]"
            :aria-pressed="grouped"
            @click="grouped = !grouped"
        >
            Grouped headers
        </button>
        <button
            :class="['mode-btn', { active: tallBand }]"
            :aria-pressed="tallBand"
            @click="tallBand = !tallBand"
        >
            Tall band
        </button>
        <button
            :class="['mode-btn', { active: groupRows }]"
            :aria-pressed="groupRows"
            @click="groupRows = !groupRows"
        >
            Group rows
        </button>
        <button class="mode-btn" :disabled="groupRows === false" @click="expandAllGroups">
            Expand all
        </button>
    </div>

    <div class="grid-container">
        <GpGrid
            ref="gridRef"
            :row-drag-entire-row="true"
            :highlighting="highlightingProps"
            :columns="columns"
            :column-groups="grouped ? demoColumnGroups : undefined"
            :header-band-heights="tallBand ? tallBandHeights : undefined"
            :row-grouping="rowGrouping"
            :labels="gridLabels"
            :freeze-rows="freezeRows"
            :on-frozen-rows-changed="handleFrozenRowsChanged"
            :overscan="12"
            :data-source="dataSource"
            :get-row-id="(row: unknown) => (row as Person).id"
            :row-height="36"
            :row-resize="true"
            :header-height="DEMO_HEADER_HEIGHT"
            :dark-mode="true"
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
            Double-click cells to edit (Name/Tags), or Bio for a read-only peek
            overlay
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
.gp-grid-row.row-highlight .gp-grid-cell {
    background-color: rgba(59, 130, 246, 0.3) !important;
}

.column-highlight {
    background-color: rgba(16, 185, 129, 0.3) !important;
}

.cell-highlight {
    background-color: rgba(245, 158, 11, 0.5) !important;
}
</style>
