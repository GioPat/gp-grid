import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  effect,
} from '@angular/core';
import { defaultGridLabels, getDateOperatorOptions } from '@gp-grid/core';
import type {
  ColumnFilterModel,
  DateFilterInputType,
  FilterCombination,
  GridLabels,
} from '@gp-grid/core';
import { DATE_FILTER_CONTENT_TEMPLATE } from './date-filter-content.template';
import {
  type DateConditionGroupState,
  buildDateFilter,
  defaultDateCondition,
  defaultDateGroup,
  initDateState,
  isValueLessDateOp,
} from './filter-popup/date-filter-logic';

@Component({
  selector: 'gp-grid-date-filter-content',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: DATE_FILTER_CONTENT_TEMPLATE,
})
export class DateFilterContentComponent {
  currentFilter = input<ColumnFilterModel | undefined>(undefined);
  inputType = input<DateFilterInputType>('date');
  labels = input<GridLabels>(defaultGridLabels);

  apply = output<ColumnFilterModel | null>();

  dateGroups: DateConditionGroupState[] = [defaultDateGroup()];
  groupCombination: FilterCombination = 'and';

  protected readonly isValueLessDateOp = isValueLessDateOp;

  constructor() {
    effect(() => {
      const state = initDateState(this.currentFilter(), this.inputType());
      this.dateGroups = state.dateGroups;
      this.groupCombination = state.combination;
    });
  }

  protected operators(): ReturnType<typeof getDateOperatorOptions> {
    return getDateOperatorOptions(this.labels());
  }

  addCondition(groupIndex: number): void {
    this.dateGroups[groupIndex]?.conditions.push(defaultDateCondition());
  }

  removeCondition(groupIndex: number, index: number): void {
    this.dateGroups[groupIndex]?.conditions.splice(index, 1);
  }

  addGroup(): void {
    this.dateGroups.push(defaultDateGroup());
  }

  removeGroup(groupIndex: number): void {
    this.dateGroups.splice(groupIndex, 1);
  }

  handleApply(): void {
    this.apply.emit(buildDateFilter(this.dateGroups, this.groupCombination));
  }
}
