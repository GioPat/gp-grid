<script setup lang="ts">
import { computed } from "vue";
import { getDateOperatorOptions } from "@gp-grid/core";
import type {
  ColumnFilterModel,
  DateFilterCondition,
  DateFilterOperator,
  FilterConditionGroup,
  GridLabels,
} from "@gp-grid/core";
import {
  useFilterConditions,
  type LocalFilterGroup,
} from "../composables/useFilterConditions";

const props = defineProps<{
  currentFilter?: ColumnFilterModel;
  labels: GridLabels;
}>();

const emit = defineEmits<{
  apply: [filter: ColumnFilterModel | null];
  close: [];
}>();

const operators = computed(() => getDateOperatorOptions(props.labels));

const formatDateForInput = (date: Date | string | undefined): string => {
  if (!date) return "";
  const normalizedDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(normalizedDate.getTime())) return "";
  return normalizedDate.toISOString().split("T")[0]!;
};

const initialGroups = computed((): LocalFilterGroup<DateFilterOperator>[] => {
  if (props.currentFilter?.groups.length) {
    return props.currentFilter.groups.map((group) => ({
      combination: group.combination,
      conditions: group.conditions.map((condition) => {
        const dateCondition = condition as DateFilterCondition;
        return {
          operator: dateCondition.operator,
          value: formatDateForInput(dateCondition.value),
          valueTo: formatDateForInput(dateCondition.valueTo),
        };
      }),
    }));
  }
  return [{
    conditions: [{ operator: "=", value: "", valueTo: "" }],
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

const isValidCondition = (
  condition: LocalFilterGroup<DateFilterOperator>["conditions"][number],
): boolean => {
  if (condition.operator === "blank" || condition.operator === "notBlank") {
    return true;
  }
  if (condition.operator === "between") {
    return condition.value !== "" && condition.valueTo !== "";
  }
  return condition.value !== "";
};

const handleApply = (): void => {
  const filterGroups: FilterConditionGroup[] = groups.value.flatMap((group) => {
    const validConditions = group.conditions.filter(isValidCondition);
    if (validConditions.length === 0) return [];
    const conditions: DateFilterCondition[] = validConditions.map((condition) => ({
      type: "date",
      operator: condition.operator,
      value: condition.value || undefined,
      valueTo: condition.valueTo || undefined,
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
  <div class="gp-grid-filter-content gp-grid-filter-date">
    <div class="gp-grid-filter-groups">
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
                @change="updateCondition(groupIndex, conditionIndex, { operator: ($event.target as HTMLSelectElement).value as DateFilterOperator })"
              >
                <option v-for="operator in operators" :key="operator.value" :value="operator.value">
                  {{ operator.label }}
                </option>
              </select>
              <input
                v-if="condition.operator !== 'blank' && condition.operator !== 'notBlank'"
                type="date"
                :value="condition.value"
                @input="updateCondition(groupIndex, conditionIndex, { value: ($event.target as HTMLInputElement).value })"
              />
              <template v-if="condition.operator === 'between'">
                <span class="gp-grid-filter-to">{{ labels.betweenSeparator }}</span>
                <input
                  type="date"
                  :value="condition.valueTo"
                  @input="updateCondition(groupIndex, conditionIndex, { valueTo: ($event.target as HTMLInputElement).value })"
                />
              </template>
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
            @click="addCondition(groupIndex, '=')"
          >
            {{ labels.addCondition }}
          </button>
      </div>
      <button
        type="button"
        class="gp-grid-filter-add gp-grid-filter-add-group"
        @click="addGroup('=')"
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
