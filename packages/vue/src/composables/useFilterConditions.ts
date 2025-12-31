// packages/vue/src/composables/useFilterConditions.ts

import { ref, type Ref } from "vue";

export interface FilterCondition<TOperator extends string> {
  operator: TOperator;
  value: string;
  valueTo: string;
}

export interface UseFilterConditionsResult<TOperator extends string> {
  conditions: Ref<FilterCondition<TOperator>[]>;
  combination: Ref<"and" | "or">;
  updateCondition: (index: number, updates: Partial<FilterCondition<TOperator>>) => void;
  addCondition: (defaultOperator: TOperator) => void;
  removeCondition: (index: number) => void;
}

/**
 * Composable for managing filter conditions.
 * Used by NumberFilterContent, DateFilterContent, and TextFilterContent (condition mode).
 */
export function useFilterConditions<TOperator extends string>(
  initialConditions: FilterCondition<TOperator>[],
  initialCombination: "and" | "or" = "and",
): UseFilterConditionsResult<TOperator> {
  const conditions = ref<FilterCondition<TOperator>[]>([...initialConditions]) as Ref<
    FilterCondition<TOperator>[]
  >;
  const combination = ref<"and" | "or">(initialCombination);

  const updateCondition = (index: number, updates: Partial<FilterCondition<TOperator>>): void => {
    const next = [...conditions.value];
    next[index] = { ...next[index]!, ...updates };
    conditions.value = next;
  };

  const addCondition = (defaultOperator: TOperator): void => {
    conditions.value = [...conditions.value, { operator: defaultOperator, value: "", valueTo: "" }];
  };

  const removeCondition = (index: number): void => {
    conditions.value = conditions.value.filter((_, i) => i !== index);
  };

  return {
    conditions,
    combination,
    updateCondition,
    addCondition,
    removeCondition,
  };
}
