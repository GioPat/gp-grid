<script setup lang="ts">
import { computed, ref } from "vue";
import {
  formatLabel,
  getTextOperatorOptions,
  groupDistinctValues,
  isBlankCellValue,
  labelsForSelectedValues,
  rawValuesForLabels,
} from "@gp-grid/core";
import type {
  CellValue,
  ColumnFilterModel,
  FilterConditionGroup,
  GridLabels,
  TextFilterCondition,
  TextFilterOperator,
} from "@gp-grid/core";
import {
  useFilterConditions,
  type LocalFilterGroup,
} from "../composables/useFilterConditions";

type FilterMode = "values" | "condition";

const MAX_VALUES_FOR_LIST = 100;

const props = defineProps<{
  distinctValues: CellValue[];
  valueFormatter?: (value: CellValue) => string;
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
}>();

const emit = defineEmits<{
  apply: [filter: ColumnFilterModel | null];
  close: [];
}>();

const operators = computed(() => getTextOperatorOptions(props.labels));
const uniqueEntries = computed(() =>
  groupDistinctValues(props.distinctValues, props.valueFormatter));
const hasTooManyValues = computed(
  () => uniqueEntries.value.length > MAX_VALUES_FOR_LIST,
);
const firstCondition = computed(() =>
  props.currentFilter?.groups[0]?.conditions[0] as TextFilterCondition | undefined);
const initialMode = computed((): FilterMode => {
  if (firstCondition.value === undefined) {
    return hasTooManyValues.value ? "condition" : "values";
  }
  return firstCondition.value.selectedValues !== undefined
    ? "values"
    : "condition";
});
const mode = ref<FilterMode>(initialMode.value);

const initialSelected = computed(() => {
  if (firstCondition.value?.selectedValues === undefined) return new Set<string>();
  return labelsForSelectedValues(
    uniqueEntries.value,
    firstCondition.value.selectedValues,
  );
});
const searchText = ref("");
const selectedLabels = ref(new Set(initialSelected.value));
const includeBlanks = ref(firstCondition.value?.includeBlank ?? true);

const initialGroups = computed((): LocalFilterGroup<TextFilterOperator>[] => {
  if (
    props.currentFilter?.groups.length &&
    firstCondition.value?.selectedValues === undefined
  ) {
    return props.currentFilter.groups.map((group) => ({
      combination: group.combination,
      conditions: group.conditions.map((condition) => {
        const textCondition = condition as TextFilterCondition;
        return {
          operator: textCondition.operator,
          value: textCondition.value ?? "",
          valueTo: "",
        };
      }),
    }));
  }
  return [{
    conditions: [{ operator: "contains", value: "", valueTo: "" }],
    combination: "and",
  }];
});

const {
  groups,
  combination,
  setGroupCombination,
  updateCondition,
  addCondition,
  removeCondition,
  addGroup,
  removeGroup,
} = useFilterConditions(
  initialGroups.value,
  props.currentFilter?.combination ?? "and",
);

const displayEntries = computed(() => {
  if (!searchText.value) return uniqueEntries.value;
  const normalizedSearch = searchText.value.toLowerCase();
  return uniqueEntries.value.filter((entry) =>
    entry.label.toLowerCase().includes(normalizedSearch));
});
const hasBlanks = computed(() => props.distinctValues.some(isBlankCellValue));
const allSelected = computed(() => {
  const allNonBlank = displayEntries.value.every((entry) =>
    selectedLabels.value.has(entry.label));
  return allNonBlank && (!hasBlanks.value || includeBlanks.value);
});

const handleSelectAll = (): void => {
  selectedLabels.value = new Set(displayEntries.value.map((entry) => entry.label));
  if (hasBlanks.value) includeBlanks.value = true;
};

const handleDeselectAll = (): void => {
  selectedLabels.value = new Set();
  includeBlanks.value = false;
};

const handleValueToggle = (label: string): void => {
  const next = new Set(selectedLabels.value);
  if (next.has(label)) {
    next.delete(label);
  } else {
    next.add(label);
  }
  selectedLabels.value = next;
};

const isValidCondition = (
  condition: LocalFilterGroup<TextFilterOperator>["conditions"][number],
): boolean => {
  if (condition.operator === "blank" || condition.operator === "notBlank") {
    return true;
  }
  return condition.value.trim() !== "";
};

const handleApply = (): void => {
  if (mode.value === "values") {
    const allNonBlankSelected = uniqueEntries.value.every((entry) =>
      selectedLabels.value.has(entry.label));
    const isAllSelected = allNonBlankSelected &&
      (!hasBlanks.value || includeBlanks.value);
    if (isAllSelected) {
      emit("apply", null);
      return;
    }
    const condition: TextFilterCondition = {
      type: "text",
      operator: "equals",
      selectedValues: rawValuesForLabels(
        uniqueEntries.value,
        selectedLabels.value,
      ),
      includeBlank: includeBlanks.value,
    };
    emit("apply", {
      groups: [{ conditions: [condition], combination: "and" }],
      combination: "and",
    });
    return;
  }

  const filterGroups: FilterConditionGroup[] = groups.value.flatMap((group) => {
    const validConditions = group.conditions.filter(isValidCondition);
    if (validConditions.length === 0) return [];
    const conditions: TextFilterCondition[] = validConditions.map((condition) => ({
      type: "text",
      operator: condition.operator,
      value: condition.value,
    }));
    return [{ conditions, combination: group.combination }];
  });
  if (filterGroups.length === 0) {
    emit("apply", null);
    return;
  }
  emit("apply", { groups: filterGroups, combination: combination.value });
};

const handleClear = (): void => emit("apply", null);
</script>

<template>
  <div class="gp-grid-filter-content gp-grid-filter-text">
    <div v-if="!hasTooManyValues" class="gp-grid-filter-mode-toggle">
      <button type="button" :class="{ active: mode === 'values' }" :aria-pressed="mode === 'values'" @click="mode = 'values'">
        {{ labels.valuesMode }}
      </button>
      <button type="button" :class="{ active: mode === 'condition' }" :aria-pressed="mode === 'condition'" @click="mode = 'condition'">
        {{ labels.conditionMode }}
      </button>
    </div>
    <div v-if="hasTooManyValues && mode === 'condition'" class="gp-grid-filter-info">
      {{ formatLabel(labels.tooManyValues, { count: uniqueEntries.length }) }}
    </div>

    <template v-if="mode === 'values'">
      <input
        v-model="searchText"
        class="gp-grid-filter-search"
        type="text"
        :placeholder="labels.searchPlaceholder"
        autofocus
      />
      <div class="gp-grid-filter-actions">
        <button type="button" :disabled="allSelected" @click="handleSelectAll">
          {{ labels.selectAll }}
        </button>
        <button type="button" @click="handleDeselectAll">
          {{ labels.deselectAll }}
        </button>
      </div>
      <div class="gp-grid-filter-list">
        <label v-if="hasBlanks" class="gp-grid-filter-option">
          <input type="checkbox" :checked="includeBlanks" @change="includeBlanks = !includeBlanks" />
          <span class="gp-grid-filter-blank">{{ labels.blanks }}</span>
        </label>
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

    <div v-if="mode === 'condition'" class="gp-grid-filter-groups">
      <div v-if="groups.length > 1" class="gp-grid-filter-combination">
        <button type="button" :class="{ active: combination === 'and' }" :aria-pressed="combination === 'and'" @click="combination = 'and'">
          {{ labels.and }}
        </button>
        <button type="button" :class="{ active: combination === 'or' }" :aria-pressed="combination === 'or'" @click="combination = 'or'">
          {{ labels.or }}
        </button>
      </div>
      <div
        v-for="(group, groupIndex) in groups"
        :key="groupIndex"
        class="gp-grid-filter-group"
      >
        <div
          v-if="group.conditions.length > 1 || groups.length > 1"
          class="gp-grid-filter-group-actions"
        >
          <div v-if="group.conditions.length > 1" class="gp-grid-filter-combination">
            <button
              type="button"
              :class="{ active: group.combination === 'and' }"
              :aria-pressed="group.combination === 'and'"
              @click="setGroupCombination(groupIndex, 'and')"
            >
              {{ labels.and }}
            </button>
            <button
              type="button"
              :class="{ active: group.combination === 'or' }"
              :aria-pressed="group.combination === 'or'"
              @click="setGroupCombination(groupIndex, 'or')"
            >
              {{ labels.or }}
            </button>
          </div>
          <button
            v-if="groups.length > 1"
            type="button"
            class="gp-grid-filter-remove gp-grid-filter-group-remove"
            @click="removeGroup(groupIndex)"
          >
            {{ labels.removeGroup }}
          </button>
        </div>
          <div
            v-for="(condition, conditionIndex) in group.conditions"
            :key="conditionIndex"
            class="gp-grid-filter-condition"
          >
            <div class="gp-grid-filter-row">
              <select
                :value="condition.operator"
                :autofocus="groupIndex === 0 && conditionIndex === 0"
                @change="updateCondition(groupIndex, conditionIndex, { operator: ($event.target as HTMLSelectElement).value as TextFilterOperator })"
              >
                <option v-for="operator in operators" :key="operator.value" :value="operator.value">
                  {{ operator.label }}
                </option>
              </select>
              <input
                v-if="condition.operator !== 'blank' && condition.operator !== 'notBlank'"
                type="text"
                class="gp-grid-filter-text-input"
                :value="condition.value"
                :placeholder="labels.valuePlaceholder"
                @input="updateCondition(groupIndex, conditionIndex, { value: ($event.target as HTMLInputElement).value })"
              />
              <button
                v-if="group.conditions.length > 1"
                type="button"
                class="gp-grid-filter-remove"
                @click="removeCondition(groupIndex, conditionIndex)"
              >
                {{ labels.removeCondition }}
              </button>
            </div>
          </div>
          <button
            type="button"
            class="gp-grid-filter-add"
            @click="addCondition(groupIndex, 'contains')"
          >
            {{ labels.addCondition }}
          </button>
      </div>
      <button
        type="button"
        class="gp-grid-filter-add gp-grid-filter-add-group"
        @click="addGroup('contains')"
      >
        {{ labels.addGroup }}
      </button>
    </div>

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
