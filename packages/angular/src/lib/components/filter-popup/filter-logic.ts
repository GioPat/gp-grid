import type {
  ColumnDefinition,
  ColumnFilterModel,
  DistinctValueEntry,
  NumberFilterCondition,
  NumberFilterOperator,
  TextFilterCondition,
  TextFilterOperator,
} from '@gp-grid/core';
import { labelsForSelectedValues, rawValuesForLabels } from '@gp-grid/core';

export interface TextConditionState {
  operator: string;
  value: string;
  nextOperator: 'and' | 'or';
}

export interface NumberConditionState {
  operator: string;
  value: string;
  valueTo: string;
  nextOperator: 'and' | 'or';
}

export type FilterMode = 'values' | 'condition';

export const TEXT_OPERATORS: ReadonlyArray<{ value: TextFilterOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'notContains', label: 'Does not contain' },
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Does not equal' },
  { value: 'startsWith', label: 'Starts with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'blank', label: 'Is blank' },
  { value: 'notBlank', label: 'Is not blank' },
] as const;

export const NUMBER_OPERATORS: ReadonlyArray<{ value: NumberFilterOperator; label: string }> = [
  { value: '=', label: 'Equals' },
  { value: '!=', label: 'Does not equal' },
  { value: '>', label: 'Greater than' },
  { value: '<', label: 'Less than' },
  { value: '>=', label: 'Greater than or equal' },
  { value: '<=', label: 'Less than or equal' },
  { value: 'between', label: 'Between' },
  { value: 'blank', label: 'Is blank' },
  { value: 'notBlank', label: 'Is not blank' },
] as const;

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
  nextOperator: 'and',
});

export const defaultNumberCondition = (): NumberConditionState => ({
  operator: '=',
  value: '',
  valueTo: '',
  nextOperator: 'and',
});

// Popup checkbox state tracks display LABELS; the filter model stores RAW
// values (resolved via rawValuesForLabels on apply). Entry grouping lives in
// core (`groupDistinctValues`), shared with the react/vue wrappers.

export interface TextInitState {
  filterMode: FilterMode;
  selectedLabels: Set<string>;
  includeBlanks: boolean;
  textConditions: TextConditionState[];
}

export const initTextState = (
  filter: ColumnFilterModel | undefined,
  entries: ReadonlyArray<DistinctValueEntry>,
): TextInitState => {
  if (!filter) return defaultTextState(entries);

  const textConds = filter.conditions.filter(
    (c): c is TextFilterCondition => c.type === 'text'
  );
  if (textConds.length === 0) return defaultTextState(entries);

  const firstCond = textConds[0];
  if (firstCond?.selectedValues !== undefined) {
    return {
      filterMode: 'values',
      selectedLabels: labelsForSelectedValues(entries, firstCond.selectedValues),
      includeBlanks: firstCond.includeBlank ?? true,
      textConditions: [defaultTextCondition()],
    };
  }

  return {
    filterMode: 'condition',
    selectedLabels: new Set(entries.map(e => e.label)),
    includeBlanks: true,
    textConditions: textConds.map((c, i) => ({
      operator: c.operator,
      value: c.value ?? '',
      nextOperator: textConds[i]?.nextOperator ?? 'and',
    })),
  };
};

const defaultTextState = (entries: ReadonlyArray<DistinctValueEntry>): TextInitState => ({
  filterMode: 'values',
  selectedLabels: new Set(entries.map(e => e.label)),
  includeBlanks: true,
  textConditions: [defaultTextCondition()],
});

export const initNumberConditions = (
  filter: ColumnFilterModel | undefined,
): NumberConditionState[] => {
  if (!filter) return [defaultNumberCondition()];

  const numConds = filter.conditions.filter(
    (c): c is NumberFilterCondition => c.type === 'number'
  );
  if (numConds.length === 0) return [defaultNumberCondition()];

  return numConds.map((c, i) => ({
    operator: c.operator,
    value: c.value !== undefined ? String(c.value) : '',
    valueTo: c.valueTo !== undefined ? String(c.valueTo) : '',
    nextOperator: numConds[i]?.nextOperator ?? 'and',
  }));
};

export interface TextFilterInput {
  filterMode: FilterMode;
  entries: ReadonlyArray<DistinctValueEntry>;
  selectedLabels: Set<string>;
  includeBlanks: boolean;
  textConditions: TextConditionState[];
}

export const buildTextFilter = (input: TextFilterInput): ColumnFilterModel | null => {
  if (input.filterMode === 'values') {
    return buildValuesFilter(input);
  }
  return buildConditionTextFilter(input.textConditions);
};

const buildValuesFilter = (input: TextFilterInput): ColumnFilterModel | null => {
  const allSelected = input.entries.every(e => input.selectedLabels.has(e.label));
  if (allSelected && input.includeBlanks) return null;

  return {
    conditions: [{
      type: 'text',
      operator: 'equals',
      selectedValues: rawValuesForLabels(input.entries, input.selectedLabels),
      includeBlank: input.includeBlanks,
    }],
    combination: 'or',
  };
};

const buildConditionTextFilter = (
  textConditions: TextConditionState[],
): ColumnFilterModel | null => {
  const conditions: TextFilterCondition[] = [];
  for (let i = 0; i < textConditions.length; i++) {
    const cond = textConditions[i];
    if (!cond) continue;
    if (!isValueLessTextOp(cond.operator) && !cond.value) continue;

    const out: TextFilterCondition = {
      type: 'text',
      operator: cond.operator as TextFilterOperator,
    };
    if (!isValueLessTextOp(cond.operator)) out.value = cond.value;
    linkNextOperator(conditions, i, textConditions);
    conditions.push(out);
  }
  if (conditions.length === 0) return null;
  return { conditions, combination: textConditions[0]?.nextOperator ?? 'and' };
};

export const buildNumberFilter = (
  numberConditions: NumberConditionState[],
): ColumnFilterModel | null => {
  const conditions: NumberFilterCondition[] = [];
  for (let i = 0; i < numberConditions.length; i++) {
    const cond = numberConditions[i];
    if (!cond) continue;
    if (!isValueLessNumberOp(cond.operator) && !cond.value) continue;

    const out: NumberFilterCondition = {
      type: 'number',
      operator: cond.operator as NumberFilterOperator,
    };
    if (!isValueLessNumberOp(cond.operator)) {
      out.value = parseFloat(cond.value);
      if (cond.operator === 'between' && cond.valueTo) {
        out.valueTo = parseFloat(cond.valueTo);
      }
    }
    linkNextOperator(conditions, i, numberConditions);
    conditions.push(out);
  }
  if (conditions.length === 0) return null;
  return { conditions, combination: numberConditions[0]?.nextOperator ?? 'and' };
};

const linkNextOperator = <T extends { nextOperator?: 'and' | 'or' }>(
  built: T[],
  currentIndex: number,
  source: ReadonlyArray<{ nextOperator: 'and' | 'or' }>,
): void => {
  const prev = built[built.length - 1];
  if (prev === undefined || currentIndex === 0) return;
  const prevSource = source[currentIndex - 1];
  prev.nextOperator = prevSource?.nextOperator ?? 'and';
};

export const resolveColId = (column: ColumnDefinition): string =>
  column.colId ?? column.field;

export const isNumberColumn = (column: ColumnDefinition): boolean =>
  column.cellDataType === 'number';
