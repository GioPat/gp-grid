import { ref, type Ref } from "vue";
import type { FilterCombination } from "@gp-grid/core";

export interface LocalFilterCondition<TOperator extends string> {
  operator: TOperator;
  value: string;
  valueTo: string;
}

export interface LocalFilterGroup<TOperator extends string> {
  conditions: LocalFilterCondition<TOperator>[];
  combination: FilterCombination;
}

export interface UseFilterConditionsResult<TOperator extends string> {
  groups: Ref<LocalFilterGroup<TOperator>[]>;
  combination: Ref<FilterCombination>;
  setGroupCombination: (
    groupIndex: number,
    combination: FilterCombination,
  ) => void;
  updateCondition: (
    groupIndex: number,
    conditionIndex: number,
    updates: Partial<LocalFilterCondition<TOperator>>,
  ) => void;
  addCondition: (groupIndex: number, defaultOperator: TOperator) => void;
  removeCondition: (groupIndex: number, conditionIndex: number) => void;
  addGroup: (defaultOperator: TOperator) => void;
  removeGroup: (groupIndex: number) => void;
}

const defaultCondition = <TOperator extends string>(
  operator: TOperator,
): LocalFilterCondition<TOperator> => ({
  operator,
  value: "",
  valueTo: "",
});

/** Manage the one-level condition groups used by every Vue filter editor. */
export function useFilterConditions<TOperator extends string>(
  initialGroups: LocalFilterGroup<TOperator>[],
  initialCombination: FilterCombination = "and",
): UseFilterConditionsResult<TOperator> {
  const groups = ref(initialGroups.map((group) => ({
    ...group,
    conditions: [...group.conditions],
  }))) as Ref<LocalFilterGroup<TOperator>[]>;
  const combination = ref<FilterCombination>(initialCombination);

  const setGroupCombination = (
    groupIndex: number,
    nextCombination: FilterCombination,
  ): void => {
    groups.value = groups.value.map((group, index) =>
      index === groupIndex
        ? { ...group, combination: nextCombination }
        : group);
  };

  const updateCondition = (
    groupIndex: number,
    conditionIndex: number,
    updates: Partial<LocalFilterCondition<TOperator>>,
  ): void => {
    groups.value = groups.value.map((group, index) => {
      if (index !== groupIndex) return group;
      const conditions = group.conditions.map((condition, currentIndex) =>
        currentIndex === conditionIndex
          ? { ...condition, ...updates }
          : condition);
      return { ...group, conditions };
    });
  };

  const addCondition = (
    groupIndex: number,
    defaultOperator: TOperator,
  ): void => {
    groups.value = groups.value.map((group, index) =>
      index === groupIndex
        ? {
          ...group,
          conditions: [...group.conditions, defaultCondition(defaultOperator)],
        }
        : group);
  };

  const removeCondition = (
    groupIndex: number,
    conditionIndex: number,
  ): void => {
    groups.value = groups.value.map((group, index) =>
      index === groupIndex
        ? {
          ...group,
          conditions: group.conditions.filter(
            (_condition, currentIndex) => currentIndex !== conditionIndex,
          ),
        }
        : group);
  };

  const addGroup = (defaultOperator: TOperator): void => {
    groups.value = [
      ...groups.value,
      {
        conditions: [defaultCondition(defaultOperator)],
        combination: "and",
      },
    ];
  };

  const removeGroup = (groupIndex: number): void => {
    groups.value = groups.value.filter((_group, index) => index !== groupIndex);
  };

  return {
    groups,
    combination,
    setGroupCombination,
    updateCondition,
    addCondition,
    removeCondition,
    addGroup,
    removeGroup,
  };
}
