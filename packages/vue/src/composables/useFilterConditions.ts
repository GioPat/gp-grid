// packages/vue/src/composables/useFilterConditions.ts

import { ref, type Ref } from "vue";

export interface LocalFilterCondition<TOperator extends string> {
  operator: TOperator;
  value: string;
  valueTo: string;
  nextOperator: "and" | "or";
}

export interface UseFilterConditionsResult<TOperator extends string> {
  conditions: Ref<LocalFilterCondition<TOperator>[]>;
  combination: Ref<"and" | "or">;
  updateCondition: (index: number, updates: Partial<LocalFilterCondition<TOperator>>) => void;
  addCondition: (defaultOperator: TOperator) => void;
  removeCondition: (index: number) => void;
}

/**
 * Composable for managing filter conditions.
 * Used by NumberFilterContent, DateFilterContent, and TextFilterContent (condition mode).
 */
export function useFilterConditions<TOperator extends string>(
  initialConditions: LocalFilterCondition<TOperator>[],
  initialCombination: "and" | "or" = "and",
): UseFilterConditionsResult<TOperator> {
  const conditions = ref<LocalFilterCondition<TOperator>[]>([...initialConditions]) as Ref<
    LocalFilterCondition<TOperator>[]
  >;
  const combination = ref<"and" | "or">(initialCombination);

  const updateCondition = (index: number, updates: Partial<LocalFilterCondition<TOperator>>): void => {
    const next = [...conditions.value];
    next[index] = { ...next[index]!, ...updates };
    conditions.value = next;
  };

  const addCondition = (defaultOperator: TOperator): void => {
    conditions.value = [...conditions.value, { operator: defaultOperator, value: "", valueTo: "", nextOperator: "and" }];
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
