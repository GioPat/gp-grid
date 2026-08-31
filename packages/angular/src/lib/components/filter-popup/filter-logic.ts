import type {
  ColumnDefinition,
  ColumnFilterModel,
  DistinctValueEntry,
  FilterCombination,
  FilterConditionGroup,
  NumberFilterCondition,
  NumberFilterOperator,
  TextFilterCondition,
  TextFilterOperator,
} from '@gp-grid/core';
import { labelsForSelectedValues, rawValuesForLabels } from '@gp-grid/core';

export interface TextConditionState {
  operator: string;
  value: string;
}

export interface NumberConditionState {
  operator: string;
  value: string;
  valueTo: string;
}

export interface ConditionGroupState<TCondition> {
  conditions: TCondition[];
  combination: FilterCombination;
}

export type TextConditionGroupState = ConditionGroupState<TextConditionState>;
export type NumberConditionGroupState = ConditionGroupState<NumberConditionState>;
export type FilterMode = 'values' | 'condition';

const VALUE_LESS_TEXT_OPERATORS: ReadonlyArray<string> = ['blank', 'notBlank'];
const VALUE_LESS_NUMBER_OPERATORS: ReadonlyArray<string> = ['blank', 'notBlank'];

export const MAX_CHECKBOX_VALUES = 100;

export const isValueLessTextOp = (operator: string): boolean =>
  VALUE_LESS_TEXT_OPERATORS.includes(operator);

export const isValueLessNumberOp = (operator: string): boolean =>
  VALUE_LESS_NUMBER_OPERATORS.includes(operator);

export const defaultTextCondition = (): TextConditionState => ({
  operator: 'contains',
  value: '',
});

export const defaultNumberCondition = (): NumberConditionState => ({
  operator: '=',
  value: '',
  valueTo: '',
});

export const defaultTextGroup = (): TextConditionGroupState => ({
  conditions: [defaultTextCondition()],
  combination: 'and',
});

export const defaultNumberGroup = (): NumberConditionGroupState => ({
  conditions: [defaultNumberCondition()],
  combination: 'and',
});

export interface TextInitState {
  filterMode: FilterMode;
  selectedLabels: Set<string>;
  includeBlanks: boolean;
  textGroups: TextConditionGroupState[];
  combination: FilterCombination;
}

const defaultTextState = (
  entries: ReadonlyArray<DistinctValueEntry>,
): TextInitState => ({
  filterMode: 'values',
  selectedLabels: new Set(entries.map(entry => entry.label)),
  includeBlanks: true,
  textGroups: [defaultTextGroup()],
  combination: 'and',
});

export const initTextState = (
  filter: ColumnFilterModel | undefined,
  entries: ReadonlyArray<DistinctValueEntry>,
): TextInitState => {
  if (!filter) return defaultTextState(entries);

  const firstCondition = filter.groups[0]?.conditions[0];
  if (firstCondition?.type === 'text' && firstCondition.selectedValues !== undefined) {
    return {
      filterMode: 'values',
      selectedLabels: labelsForSelectedValues(entries, firstCondition.selectedValues),
      includeBlanks: firstCondition.includeBlank ?? true,
      textGroups: [defaultTextGroup()],
      combination: 'and',
    };
  }

  const textGroups = filter.groups.flatMap((group) => {
    const conditions = group.conditions.flatMap((condition) => {
      if (condition.type !== 'text') return [];
      return [{ operator: condition.operator, value: condition.value ?? '' }];
    });
    if (conditions.length === 0) return [];
    return [{ conditions, combination: group.combination }];
  });
  if (textGroups.length === 0) return defaultTextState(entries);

  return {
    filterMode: 'condition',
    selectedLabels: new Set(entries.map(entry => entry.label)),
    includeBlanks: true,
    textGroups,
    combination: filter.combination,
  };
};

export interface NumberInitState {
  numberGroups: NumberConditionGroupState[];
  combination: FilterCombination;
}

export const initNumberState = (
  filter: ColumnFilterModel | undefined,
): NumberInitState => {
  if (!filter) {
    return { numberGroups: [defaultNumberGroup()], combination: 'and' };
  }
  const numberGroups = filter.groups.flatMap((group) => {
    const conditions = group.conditions.flatMap((condition) => {
      if (condition.type !== 'number') return [];
      return [{
        operator: condition.operator,
        value: condition.value !== undefined ? String(condition.value) : '',
        valueTo: condition.valueTo !== undefined ? String(condition.valueTo) : '',
      }];
    });
    if (conditions.length === 0) return [];
    return [{ conditions, combination: group.combination }];
  });
  if (numberGroups.length === 0) {
    return { numberGroups: [defaultNumberGroup()], combination: 'and' };
  }
  return { numberGroups, combination: filter.combination };
};

export interface TextFilterInput {
  filterMode: FilterMode;
  entries: ReadonlyArray<DistinctValueEntry>;
  selectedLabels: Set<string>;
  includeBlanks: boolean;
  textGroups: TextConditionGroupState[];
  combination: FilterCombination;
}

export const buildTextFilter = (
  input: TextFilterInput,
): ColumnFilterModel | null => {
  if (input.filterMode === 'values') return buildValuesFilter(input);
  const groups = buildTextGroups(input.textGroups);
  if (groups.length === 0) return null;
  return { groups, combination: input.combination };
};

const buildValuesFilter = (
  input: TextFilterInput,
): ColumnFilterModel | null => {
  const allSelected = input.entries.every(entry =>
    input.selectedLabels.has(entry.label));
  if (allSelected && input.includeBlanks) return null;

  return {
    groups: [{
      conditions: [{
        type: 'text',
        operator: 'equals',
        selectedValues: rawValuesForLabels(input.entries, input.selectedLabels),
        includeBlank: input.includeBlanks,
      }],
      combination: 'and',
    }],
    combination: 'and',
  };
};

const buildTextGroups = (
  sourceGroups: TextConditionGroupState[],
): FilterConditionGroup[] => sourceGroups.flatMap((group) => {
  const conditions: TextFilterCondition[] = [];
  for (const condition of group.conditions) {
    if (!isValueLessTextOp(condition.operator) && !condition.value) continue;
    const builtCondition: TextFilterCondition = {
      type: 'text',
      operator: condition.operator as TextFilterOperator,
    };
    if (!isValueLessTextOp(condition.operator)) {
      builtCondition.value = condition.value;
    }
    conditions.push(builtCondition);
  }
  if (conditions.length === 0) return [];
  return [{ conditions, combination: group.combination }];
});

export const buildNumberFilter = (
  numberGroups: NumberConditionGroupState[],
  combination: FilterCombination,
): ColumnFilterModel | null => {
  const groups: FilterConditionGroup[] = numberGroups.flatMap((group) => {
    const conditions: NumberFilterCondition[] = [];
    for (const condition of group.conditions) {
      if (!isValueLessNumberOp(condition.operator) && !condition.value) continue;
      const builtCondition: NumberFilterCondition = {
        type: 'number',
        operator: condition.operator as NumberFilterOperator,
      };
      if (!isValueLessNumberOp(condition.operator)) {
        builtCondition.value = Number.parseFloat(condition.value);
        if (condition.operator === 'between' && condition.valueTo) {
          builtCondition.valueTo = Number.parseFloat(condition.valueTo);
        }
      }
      conditions.push(builtCondition);
    }
    if (conditions.length === 0) return [];
    return [{ conditions, combination: group.combination }];
  });
  if (groups.length === 0) return null;
  return { groups, combination };
};

export const resolveColId = (column: ColumnDefinition): string =>
  column.colId ?? column.field;

export const isNumberColumn = (column: ColumnDefinition): boolean =>
  column.cellDataType === 'number';
