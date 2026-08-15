<script setup lang="ts">
import { ref, computed } from "vue";
import type { CellValue, ColumnFilterModel, GridLabels, TextFilterCondition, TextFilterOperator } from "@gp-grid/core";
import { formatLabel, getTextOperatorOptions, groupDistinctValues, isBlankCellValue, labelsForSelectedValues, rawValuesForLabels } from "@gp-grid/core";
import { useFilterConditions, type LocalFilterCondition } from "../composables/useFilterConditions";

const MAX_VALUES_FOR_LIST = 100;

type FilterMode = "values" | "condition";

const props = defineProps<{
  distinctValues: CellValue[];
  valueFormatter?: (v: CellValue) => string;
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
}>();

const emit = defineEmits<{
  apply: [filter: ColumnFilterModel | null];
  close: [];
}>();

const operators = computed(() => getTextOperatorOptions(props.labels));

// Checkbox rows: one entry per display label, carrying every raw value that
// formats to it. The filter model stores the RAW values; labels only exist
// inside this popup.
const uniqueEntries = computed(() =>
  groupDistinctValues(props.distinctValues, props.valueFormatter),
);

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
// Local checkbox state tracks LABELS; raw values are resolved on apply.
const initialSelected = computed(() => {
  if (!props.currentFilter?.conditions[0]) return new Set<string>();
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  if (!cond.selectedValues) return new Set<string>();
  return labelsForSelectedValues(uniqueEntries.value, cond.selectedValues);
});

const initialIncludeBlanks = computed(() => {
  if (!props.currentFilter?.conditions[0]) return true;
  const cond = props.currentFilter.conditions[0] as TextFilterCondition;
  return cond.includeBlank ?? true;
});

const searchText = ref("");
const selectedLabels = ref<Set<string>>(new Set(initialSelected.value));
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

// Empty arrays count too (tags column with no tags), so the "(Blanks)"
// opt-out renders whenever blank rows exist.
const hasBlanks = computed(() => {
  return props.distinctValues.some(isBlankCellValue);
});

const allSelected = computed(() => {
  const allNonBlank = displayEntries.value.every((e) => selectedLabels.value.has(e.label));
  return allNonBlank && (!hasBlanks.value || includeBlanks.value);
});

function handleSelectAll(): void {
  selectedLabels.value = new Set(displayEntries.value.map((e) => e.label));
  if (hasBlanks.value) includeBlanks.value = true;
}

function handleDeselectAll(): void {
  selectedLabels.value = new Set();
  includeBlanks.value = false;
}

function handleValueToggle(label: string): void {
  const next = new Set(selectedLabels.value);
  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }
  selectedLabels.value = next;
}

// ============= APPLY LOGIC =============
function handleApply(): void {
  if (mode.value === "values") {
    const allNonBlankSelected = uniqueEntries.value.every((e) => selectedLabels.value.has(e.label));
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
          selectedValues: rawValuesForLabels(uniqueEntries.value, selectedLabels.value),
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
        {{ labels.valuesMode }}
      </button>
      <button
        type="button"
        :class="{ active: mode === 'condition' }"
        @click="mode = 'condition'"
      >
        {{ labels.conditionMode }}
      </button>
    </div>

    <!-- Too many values message -->
    <div v-if="hasTooManyValues && mode === 'condition'" class="gp-grid-filter-info">
      {{ formatLabel(labels.tooManyValues, { count: uniqueEntries.length }) }}
    </div>

    <!-- VALUES MODE -->
    <template v-if="mode === 'values'">
      <!-- Search input -->
      <input
        v-model="searchText"
        class="gp-grid-filter-search"
        type="text"
        :placeholder="labels.searchPlaceholder"
        autofocus
      />

      <!-- Select all / Deselect all -->
      <div class="gp-grid-filter-actions">
        <button type="button" :disabled="allSelected" @click="handleSelectAll">
          {{ labels.selectAll }}
        </button>
        <button type="button" @click="handleDeselectAll">
          {{ labels.deselectAll }}
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
          <span class="gp-grid-filter-blank">{{ labels.blanks }}</span>
        </label>

        <!-- Values -->
        <label
          v-for="entry in displayEntries"
          :key="entry.label"
          class="gp-grid-filter-option"
        >
          <input
            type="checkbox"
            :checked="selectedLabels.has(entry.label)"
            @change="handleValueToggle(entry.label)"
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
            {{ labels.and }}
          </button>
          <button
            type="button"
            :class="{ active: conditions[index - 1]?.nextOperator === 'or' }"
            @click="updateCondition(index - 1, { nextOperator: 'or' })"
          >
            {{ labels.or }}
          </button>
        </div>

        <div class="gp-grid-filter-row">
          <!-- Operator select -->
          <select
            :value="cond.operator"
            :autofocus="index === 0"
            @change="updateCondition(index, { operator: ($event.target as HTMLSelectElement).value as TextFilterOperator })"
          >
            <option v-for="op in operators" :key="op.value" :value="op.value">
              {{ op.label }}
            </option>
          </select>

          <!-- Text input (hidden for blank/notBlank) -->
          <input
            v-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'"
            type="text"
            :value="cond.value"
            :placeholder="labels.valuePlaceholder"
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
            {{ labels.removeCondition }}
          </button>
        </div>
      </div>

      <!-- Add condition button -->
      <button type="button" class="gp-grid-filter-add" @click="addCondition('contains')">
        {{ labels.addCondition }}
      </button>
    </template>

    <!-- Apply/Clear buttons -->
    <div class="gp-grid-filter-buttons">
      <button type="button" class="gp-grid-filter-btn-clear" @click="handleClear">
        {{ labels.clear }}
      </button>
      <button type="button" class="gp-grid-filter-btn-apply" @click="handleApply">
        {{ labels.apply }}
      </button>
    </div>
  </div>
</template>
