import type {
  ColumnFilterModel,
  DateFilterCondition,
  DateFilterInputType,
  DateFilterOperator,
  FilterCombination,
  FilterConditionGroup,
} from '@gp-grid/core';
import { formatDateFilterInput } from '@gp-grid/core';
import type { ConditionGroupState } from './filter-logic';

export interface DateConditionState {
  operator: DateFilterOperator;
  value: string;
  valueTo: string;
}

export type DateConditionGroupState = ConditionGroupState<DateConditionState>;

export interface DateInitState {
  dateGroups: DateConditionGroupState[];
  combination: FilterCombination;
}

export const isValueLessDateOp = (operator: DateFilterOperator): boolean =>
  operator === 'blank' || operator === 'notBlank';

export const defaultDateCondition = (): DateConditionState => ({
  operator: '=',
  value: '',
  valueTo: '',
});

export const defaultDateGroup = (): DateConditionGroupState => ({
  conditions: [defaultDateCondition()],
  combination: 'and',
});

const defaultDateState = (): DateInitState => ({
  dateGroups: [defaultDateGroup()],
  combination: 'and',
});

export const initDateState = (
  filter: ColumnFilterModel | undefined,
  inputType: DateFilterInputType,
): DateInitState => {
  if (!filter) return defaultDateState();
  const dateGroups = filter.groups.flatMap((group) => {
    const conditions = group.conditions.flatMap((condition) => {
      if (condition.type !== 'date') return [];
      return [{
        operator: condition.operator,
        value: formatDateFilterInput(condition.value, inputType),
        valueTo: formatDateFilterInput(condition.valueTo, inputType),
      }];
    });
    if (conditions.length === 0) return [];
    return [{ conditions, combination: group.combination }];
  });
  if (dateGroups.length === 0) return defaultDateState();
  return { dateGroups, combination: filter.combination };
};

const isCompleteCondition = (condition: DateConditionState): boolean => {
  if (isValueLessDateOp(condition.operator)) return true;
  if (condition.operator === 'between') return condition.value !== '' && condition.valueTo !== '';
  return condition.value !== '';
};

const toDateCondition = (condition: DateConditionState): DateFilterCondition => ({
  type: 'date',
  operator: condition.operator,
  value: condition.value || undefined,
  valueTo: condition.valueTo || undefined,
});

export const buildDateFilter = (
  dateGroups: DateConditionGroupState[],
  combination: FilterCombination,
): ColumnFilterModel | null => {
  const groups: FilterConditionGroup[] = dateGroups.flatMap((group) => {
    const conditions = group.conditions.filter(isCompleteCondition).map(toDateCondition);
    if (conditions.length === 0) return [];
    return [{ conditions, combination: group.combination }];
  });
  if (groups.length === 0) return null;
  return { groups, combination };
};
