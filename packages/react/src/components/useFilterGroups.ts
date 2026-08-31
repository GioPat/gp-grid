import { useCallback, useState } from "react";
import type { FilterCombination } from "@gp-grid/core";

export interface LocalFilterGroup<TCondition> {
  conditions: TCondition[];
  combination: FilterCombination;
}

export interface UseFilterGroupsResult<TCondition> {
  groups: LocalFilterGroup<TCondition>[];
  combination: FilterCombination;
  setCombination: (combination: FilterCombination) => void;
  setGroupCombination: (groupIndex: number, combination: FilterCombination) => void;
  updateCondition: (
    groupIndex: number,
    conditionIndex: number,
    updates: Partial<TCondition>,
  ) => void;
  addCondition: (groupIndex: number) => void;
  removeCondition: (groupIndex: number, conditionIndex: number) => void;
  addGroup: () => void;
  removeGroup: (groupIndex: number) => void;
}

export const useFilterGroups = <TCondition,>(
  initialGroups: LocalFilterGroup<TCondition>[],
  initialCombination: FilterCombination,
  createCondition: () => TCondition,
): UseFilterGroupsResult<TCondition> => {
  const [groups, setGroups] = useState(initialGroups);
  const [combination, setCombination] = useState(initialCombination);

  const setGroupCombination = useCallback((
    groupIndex: number,
    nextCombination: FilterCombination,
  ): void => {
    setGroups((previous) => previous.map((group, index) =>
      index === groupIndex
        ? { ...group, combination: nextCombination }
        : group));
  }, []);

  const updateCondition = useCallback((
    groupIndex: number,
    conditionIndex: number,
    updates: Partial<TCondition>,
  ): void => {
    setGroups((previous) => previous.map((group, index) => {
      if (index !== groupIndex) return group;
      const conditions = group.conditions.map((condition, currentIndex) =>
        currentIndex === conditionIndex
          ? { ...condition, ...updates }
          : condition);
      return { ...group, conditions };
    }));
  }, []);

  const addCondition = useCallback((groupIndex: number): void => {
    setGroups((previous) => previous.map((group, index) =>
      index === groupIndex
        ? { ...group, conditions: [...group.conditions, createCondition()] }
        : group));
  }, [createCondition]);

  const removeCondition = useCallback((
    groupIndex: number,
    conditionIndex: number,
  ): void => {
    setGroups((previous) => previous.map((group, index) =>
      index === groupIndex
        ? {
          ...group,
          conditions: group.conditions.filter(
            (_condition, currentIndex) => currentIndex !== conditionIndex,
          ),
        }
        : group));
  }, []);

  const addGroup = useCallback((): void => {
    setGroups((previous) => [
      ...previous,
      { conditions: [createCondition()], combination: "and" },
    ]);
  }, [createCondition]);

  const removeGroup = useCallback((groupIndex: number): void => {
    setGroups((previous) => previous.filter(
      (_group, index) => index !== groupIndex,
    ));
  }, []);

  return {
    groups,
    combination,
    setCombination,
    setGroupCombination,
    updateCondition,
    addCondition,
    removeCondition,
    addGroup,
    removeGroup,
  };
};
