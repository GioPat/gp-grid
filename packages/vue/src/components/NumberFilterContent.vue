<script setup lang="ts">
import { computed } from "vue";
import type { ColumnFilterModel, NumberFilterCondition, NumberFilterOperator } from "gp-grid-core";
import { useFilterConditions, type LocalFilterCondition } from "../composables/useFilterConditions";

const OPERATORS: { value: NumberFilterOperator; label: string }[] = [
  { value: "=", label: "=" },
  { value: "!=", label: "\u2260" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: "\u2265" },
  { value: "<=", label: "\u2264" },
  { value: "between", label: "\u2194" },
  { value: "blank", label: "Is blank" },
  { value: "notBlank", label: "Not blank" },
];

const props = defineProps<{
  currentFilter?: ColumnFilterModel;
}>();

const emit = defineEmits<{
  apply: [filter: ColumnFilterModel | null];
  close: [];
}>();

// Parse initial conditions from current filter
const initialConditions = computed((): LocalFilterCondition<NumberFilterOperator>[] => {
  if (!props.currentFilter?.conditions.length) {
    return [{ operator: "=", value: "", valueTo: "", nextOperator: "and" }];
  }
  const defaultCombination = props.currentFilter.combination ?? "and";
  return props.currentFilter.conditions.map((c) => {
    const cond = c as NumberFilterCondition;
    return {
      operator: cond.operator,
      value: cond.value != null ? String(cond.value) : "",
      valueTo: cond.valueTo != null ? String(cond.valueTo) : "",
      nextOperator: cond.nextOperator ?? defaultCombination,
    };
  });
});

const { conditions, combination, updateCondition, addCondition, removeCondition } =
  useFilterConditions<NumberFilterOperator>(
    initialConditions.value,
    props.currentFilter?.combination ?? "and",
  );

function handleApply(): void {
  const validConditions = conditions.value.filter((c) => {
    if (c.operator === "blank" || c.operator === "notBlank") return true;
    if (c.operator === "between") {
      return c.value !== "" && c.valueTo !== "";
    }
    return c.value !== "";
  });

  if (validConditions.length === 0) {
    emit("apply", null);
    return;
  }

  const filter: ColumnFilterModel = {
    conditions: validConditions.map((c) => ({
      type: "number" as const,
      operator: c.operator,
      value: c.value ? parseFloat(c.value) : undefined,
      valueTo: c.valueTo ? parseFloat(c.valueTo) : undefined,
      nextOperator: c.nextOperator,
    })),
    combination: "and", // Default combination for backwards compatibility
  };
  emit("apply", filter);
}

function handleClear(): void {
  emit("apply", null);
}
</script>

<template>
  <div class="gp-grid-filter-content gp-grid-filter-number">
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
          @change="updateCondition(index, { operator: ($event.target as HTMLSelectElement).value as NumberFilterOperator })"
        >
          <option v-for="op in OPERATORS" :key="op.value" :value="op.value">
            {{ op.label }}
          </option>
        </select>

        <!-- Number input (hidden for blank/notBlank) -->
        <input
          v-if="cond.operator !== 'blank' && cond.operator !== 'notBlank'"
          type="number"
          :value="cond.value"
          placeholder="Value"
          @input="updateCondition(index, { value: ($event.target as HTMLInputElement).value })"
        />

        <!-- Second number input for "between" -->
        <template v-if="cond.operator === 'between'">
          <span class="gp-grid-filter-to">to</span>
          <input
            type="number"
            :value="cond.valueTo"
            placeholder="Value"
            @input="updateCondition(index, { valueTo: ($event.target as HTMLInputElement).value })"
          />
        </template>

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
    <button type="button" class="gp-grid-filter-add" @click="addCondition('=')">
      + Add condition
    </button>

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
