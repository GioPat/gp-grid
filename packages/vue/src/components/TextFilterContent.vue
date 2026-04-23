<script setup lang="ts">
import { ref, computed } from "vue";
import type { CellValue, ColumnFilterModel, TextFilterCondition, TextFilterOperator } from "@gp-grid/core";
import { useFilterConditions, type LocalFilterCondition } from "../composables/useFilterConditions";

const MAX_VALUES_FOR_LIST = 100;

const OPERATORS: { value: TextFilterOperator; label: string }[] = [
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Is not blank" },
];

type FilterMode = "values" | "condition";

const props = defineProps<{
  distinctValues: CellValue[];
  valueFormatter?: (v: CellValue) => string;
  currentFilter?: ColumnFilterModel;
}>();

const emit = defineEmits<{
  apply: [filter: ColumnFilterModel | null];
  close: [];
}>();

// Raw key stored in selectedValues — must match what evaluateTextCondition produces.
function valueToKey(v: CellValue): string {
  if (Array.isArray(v)) return v.join(", ");
  return String(v ?? "");
}

// Display label shown to the user.
function valueToLabel(v: CellValue): string {
  return props.valueFormatter ? props.valueFormatter(v) : valueToKey(v);
}

// Distinct entries: key for selectedValues, label for display.
const uniqueEntries = computed(() => {
  const seen = new Set<string>();
  const entries: { key: string; label: string }[] = [];
  for (const v of props.distinctValues) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const key = valueToKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, label: valueToLabel(v) });
  }
  entries.sort((a, b) => {
    const numA = parseFloat(a.label);
    const numB = parseFloat(b.label);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
  });
  return entries;
});

const hasTooManyValues = computed(() => uniqueEntries.value.length > MAX_VALUES_FOR_LIST);

// Detect initial mode from existing filter
const initialMode = computed((): FilterMode => {
  if (!props.currentFilter?.conditions[0]) {
    return hasTooManyValues.value ? "condition" : "values";
  }
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  if (cond.selectedValues && cond.selectedValues.size > 0) {
    return "values";
  }
  return "condition";
});

const mode = ref<FilterMode>(initialMode.value);

// ============= VALUES MODE STATE =============
const initialSelected = computed(() => {
  if (!props.currentFilter?.conditions[0]) return new Set<string>();
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  return cond.selectedValues ?? new Set<string>();
});

const initialIncludeBlanks = computed(() => {
  if (!props.currentFilter?.conditions[0]) return true;
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  return cond.includeBlank ?? true;
});

const searchText = ref("");
const selectedValues = ref<Set<string>>(new Set(initialSelected.value));
const includeBlanks = ref(initialIncludeBlanks.value);

// ============= CONDITION MODE STATE =============
const initialConditions = computed((): LocalFilterCondition<TextFilterOperator>[] => {
  if (!props.currentFilter?.conditions.length) {
    return [{ operator: "contains", value: "", valueTo: "", nextOperator: "and" }];
  }
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  if (cond.selectedValues && cond.selectedValues.size > 0) {
    return [{ operator: "contains", value: "", valueTo: "", nextOperator: "and" }];
  }
  const defaultCombination = props.currentFilter.combination ?? "and";
  return props.currentFilter.conditions.map((c) => {
    const tc = c as TextFilterCondition;
    return {
      operator: tc.operator,
      value: tc.value ?? "",
      valueTo: "",
      nextOperator: tc.nextOperator ?? defaultCombination,
    };
  });
});

const { conditions, combination, updateCondition, addCondition, removeCondition } =
  useFilterConditions<TextFilterOperator>(
    initialConditions.value,
    props.currentFilter?.combination ?? "and",
  );

// ============= VALUES MODE LOGIC =============
const displayEntries = computed(() => {
  if (!searchText.value) return uniqueEntries.value;
  const lower = searchText.value.toLowerCase();
  return uniqueEntries.value.filter((e) => e.label.toLowerCase().includes(lower));
});

const hasBlanks = computed(() => {
  return props.distinctValues.some((v) => v == null || v === "");
});

const allSelected = computed(() => {
  const allNonBlank = displayEntries.value.every((e) => selectedValues.value.has(e.key));
  return allNonBlank && (!hasBlanks.value || includeBlanks.value);
});

function handleSelectAll(): void {
  selectedValues.value = new Set(displayEntries.value.map((e) => e.key));
  if (hasBlanks.value) includeBlanks.value = true;
}

function handleDeselectAll(): void {
  selectedValues.value = new Set();
  includeBlanks.value = false;
}

function handleValueToggle(value: string): void {
  const next = new Set(selectedValues.value);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  selectedValues.value = next;
}

// ============= APPLY LOGIC =============
function handleApply(): void {
  if (mode.value === "values") {
    const allNonBlankSelected = uniqueEntries.value.every((e) => selectedValues.value.has(e.key));
    const isAllSelected = allNonBlankSelected && (!hasBlanks.value || includeBlanks.value);

    if (isAllSelected) {
      emit("apply", null);
      return;
    }

    const filter: ColumnFilterModel = {
      conditions: [
        {
          type: "text",
          operator: "equals",
          selectedValues: selectedValues.value,
          includeBlank: includeBlanks.value,
        },
      ],
      combination: "and",
    };
    emit("apply", filter);
  } else {
    const validConditions = conditions.value.filter((c) => {
      if (c.operator === "blank" || c.operator === "notBlank") return true;
      return c.value.trim() !== "";
    });

    if (validConditions.length === 0) {
      emit("apply", null);
      return;
    }

    const filter: ColumnFilterModel = {
      conditions: validConditions.map((c) => ({
        type: "text" as const,
        operator: c.operator,
        value: c.value,
        nextOperator: c.nextOperator,
      })),
      combination: "and", // Default combination for backwards compatibility
    };
    emit("apply", filter);
  }
}

function handleClear(): void {
  emit("apply", null);
}
</script>

<template>
  <div class="gp-grid-filter-content gp-grid-filter-text">
    <!-- Mode toggle - only show if not too many values -->
    <div v-if="!hasTooManyValues" class="gp-grid-filter-mode-toggle">
      <button
        type="button"
        :class="{ active: mode === 'values' }"
        @click="mode = 'values'"
      >
        Values
      </button>
      <button
        type="button"
        :class="{ active: mode === 'condition' }"
        @click="mode = 'condition'"
      >
        Condition
      </button>
    </div>

    <!-- Too many values message -->
    <div v-if="hasTooManyValues && mode === 'condition'" class="gp-grid-filter-info">
      Too many unique values ({{ uniqueEntries.length }}). Use conditions to filter.
    </div>

    <!-- VALUES MODE -->
    <template v-if="mode === 'values'">
      <!-- Search input -->
      <input
        v-model="searchText"
        class="gp-grid-filter-search"
        type="text"
        placeholder="Search..."
        autofocus
      />

      <!-- Select all / Deselect all -->
      <div class="gp-grid-filter-actions">
        <button type="button" :disabled="allSelected" @click="handleSelectAll">
          Select All
        </button>
        <button type="button" @click="handleDeselectAll">
          Deselect All
        </button>
      </div>

      <!-- Checkbox list -->
      <div class="gp-grid-filter-list">
        <!-- Blanks option -->
        <label v-if="hasBlanks" class="gp-grid-filter-option">
          <input
            type="checkbox"
            :checked="includeBlanks"
            @change="includeBlanks = !includeBlanks"
          />
          <span class="gp-grid-filter-blank">(Blanks)</span>
        </label>

        <!-- Values -->
        <label
          v-for="entry in displayEntries"
          :key="entry.key"
          class="gp-grid-filter-option"
        >
          <input
            type="checkbox"
            :checked="selectedValues.has(entry.key)"
            @change="handleValueToggle(entry.key)"
          />
          <span>{{ entry.label }}</span>
        </label>
      </div>
    </template>

    <!-- CONDITION MODE -->
    <template v-if="mode === 'condition'">
      <div
        v-for="(cond, index) in conditions"
        :key="index"
        class="gp-grid-filter-condition"
      >
        <!-- Combination toggle (AND/OR) for conditions after the first -->
        <div v-if="index > 0" class="gp-grid-filter-combination">
          <button
            type="button"
            :class="{ active: conditions[index - 1]?.nextOperator === 'and' }"
            @click="updateCondition(index - 1, { nextOperator: 'and' })"
          >
            AND
          </button>
          <button
            type="button"
            :class="{ active: conditions[index - 1]?.nextOperator === 'or' }"
            @click="updateCondition(index - 1, { nextOperator: 'or' })"
          >
            OR
          </button>
        </div>

        <div class="gp-grid-filter-row">
          <!-- Operator select -->
          <select
            :value="cond.operator"
            :autofocus="index === 0"
            @change="updateCondition(index, { operator: ($event.target as HTMLSelectElement).value as TextFilterOperator })"
          >
            <option v-for="op in OPERATORS" :key="op.value" :value="op.value">
              {{ op.label }}
            </option>
          </select>

          <!-- Text input (hidden for blank/notBlank) -->
          <input
            v-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'"
            type="text"
            :value="cond.value"
            placeholder="Value"
            class="gp-grid-filter-text-input"
            @input="updateCondition(index, { value: ($event.target as HTMLInputElement).value })"
          />

          <!-- Remove button (only if more than one condition) -->
          <button
            v-if="conditions.length > 1"
            type="button"
            class="gp-grid-filter-remove"
            @click="removeCondition(index)"
          >
            &times;
          </button>
        </div>
      </div>

      <!-- Add condition button -->
      <button type="button" class="gp-grid-filter-add" @click="addCondition('contains')">
        + Add condition
      </button>
    </template>

    <!-- Apply/Clear buttons -->
    <div class="gp-grid-filter-buttons">
      <button type="button" class="gp-grid-filter-btn-clear" @click="handleClear">
        Clear
      </button>
      <button type="button" class="gp-grid-filter-btn-apply" @click="handleApply">
        Apply
      </button>
    </div>
  </div>
</template>
