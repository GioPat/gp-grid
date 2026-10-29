import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  effect,
} from '@angular/core';
import {
  groupDistinctValues,
  isBlankCellValue,
  defaultGridLabels,
  getTextOperatorOptions,
  getNumberOperatorOptions,
} from '@gp-grid/core';
import type {
  ColumnDefinition,
  CellValue,
  ColumnFilterModel,
  DistinctValueEntry,
  FilterCombination,
  GridLabels,
} from '@gp-grid/core';
import { FILTER_CONTENT_TEMPLATE } from './filter-content.template';
import {
  MAX_CHECKBOX_VALUES,
  type FilterMode,
  type NumberConditionGroupState,
  type TextConditionGroupState,
  buildNumberFilter,
  buildTextFilter,
  defaultNumberCondition,
  defaultNumberGroup,
  defaultTextCondition,
  defaultTextGroup,
  initNumberState,
  initTextState,
  isNumberColumn as columnIsNumber,
  isValueLessNumberOp,
  isValueLessTextOp,
} from './filter-popup/filter-logic';

@Component({
  selector: 'gp-grid-filter-content',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: FILTER_CONTENT_TEMPLATE,
})
export class FilterContentComponent {
  column = input.required<ColumnDefinition>();
  distinctValues = input.required<CellValue[]>();
  currentFilter = input<ColumnFilterModel | undefined>(undefined);
  labels = input<GridLabels>(defaultGridLabels);

  apply = output<ColumnFilterModel | null>();

  filterMode: FilterMode = 'values';
  searchText = '';
  // Ticked display labels; raw values are resolved on apply (buildTextFilter).
  selectedLabels = new Set<string>();
  includeBlanks = true;
  textGroups: TextConditionGroupState[] = [defaultTextGroup()];
  numberGroups: NumberConditionGroupState[] = [defaultNumberGroup()];
  groupCombination: FilterCombination = 'and';

  protected textOperators(): ReturnType<typeof getTextOperatorOptions> {
    return getTextOperatorOptions(this.labels());
  }

  protected numberOperators(): ReturnType<typeof getNumberOperatorOptions> {
    return getNumberOperatorOptions(this.labels());
  }

  protected readonly isValueLessTextOp = isValueLessTextOp;
  protected readonly isValueLessNumberOp = isValueLessNumberOp;

  constructor() {
    effect(() => {
      this.column();
      this.currentFilter();
      this.initFromCurrentFilter();
    });
  }

  isNumberColumn(): boolean {
    return columnIsNumber(this.column());
  }

  showValuesMode(): boolean {
    return this.uniqueEntries().length <= MAX_CHECKBOX_VALUES;
  }

  uniqueEntries(): DistinctValueEntry[] {
    return groupDistinctValues(this.distinctValues(), this.column().valueFormatter);
  }

  // Empty arrays count too (tags column with no tags), so the "(Blanks)"
  // opt-out renders whenever blank rows exist — and only then.
  hasBlanks(): boolean {
    return this.distinctValues().some(isBlankCellValue);
  }

  filteredUniqueEntries(): DistinctValueEntry[] {
    const search = this.searchText.toLowerCase();
    if (!search) return this.uniqueEntries();
    return this.uniqueEntries().filter(e => e.label.toLowerCase().includes(search));
  }

  toggleValue(label: string, checked: boolean): void {
    if (checked) {
      this.selectedLabels.add(label);
    } else {
      this.selectedLabels.delete(label);
    }
  }

  selectAll(): void {
    this.includeBlanks = true;
    for (const entry of this.uniqueEntries()) this.selectedLabels.add(entry.label);
  }

  deselectAll(): void {
    this.includeBlanks = false;
    this.selectedLabels.clear();
  }

  onTextOperatorChange(groupIndex: number, index: number, value: string): void {
    const group = this.textGroups[groupIndex];
    if (group) setField(group.conditions, index, 'operator', value);
  }

  onNumberOperatorChange(groupIndex: number, index: number, value: string): void {
    const group = this.numberGroups[groupIndex];
    if (group) setField(group.conditions, index, 'operator', value);
  }

  addTextCondition(groupIndex: number): void {
    this.textGroups[groupIndex]?.conditions.push(defaultTextCondition());
  }

  addNumberCondition(groupIndex: number): void {
    this.numberGroups[groupIndex]?.conditions.push(defaultNumberCondition());
  }

  removeTextCondition(groupIndex: number, index: number): void {
    this.textGroups[groupIndex]?.conditions.splice(index, 1);
  }

  removeNumberCondition(groupIndex: number, index: number): void {
    this.numberGroups[groupIndex]?.conditions.splice(index, 1);
  }

  addTextGroup(): void {
    this.textGroups.push(defaultTextGroup());
  }

  addNumberGroup(): void {
    this.numberGroups.push(defaultNumberGroup());
  }

  removeTextGroup(groupIndex: number): void {
    this.textGroups.splice(groupIndex, 1);
  }

  removeNumberGroup(groupIndex: number): void {
    this.numberGroups.splice(groupIndex, 1);
  }

  setTextGroupCombination(groupIndex: number, value: FilterCombination): void {
    const group = this.textGroups[groupIndex];
    if (group) group.combination = value;
  }

  setNumberGroupCombination(groupIndex: number, value: FilterCombination): void {
    const group = this.numberGroups[groupIndex];
    if (group) group.combination = value;
  }

  setGroupCombination(value: FilterCombination): void {
    this.groupCombination = value;
  }

  handleApply(): void {
    this.apply.emit(this.buildFilter());
  }

  handleClear(): void {
    this.apply.emit(null);
  }

  private buildFilter(): ColumnFilterModel | null {
    if (this.isNumberColumn()) {
      return buildNumberFilter(this.numberGroups, this.groupCombination);
    }
    return buildTextFilter({
      filterMode: this.filterMode,
      entries: this.uniqueEntries(),
      selectedLabels: this.selectedLabels,
      includeBlanks: this.includeBlanks,
      textGroups: this.textGroups,
      combination: this.groupCombination,
    });
  }

  private initFromCurrentFilter(): void {
    const filter = this.currentFilter();
    if (this.isNumberColumn()) {
      const state = initNumberState(filter);
      this.numberGroups = state.numberGroups;
      this.groupCombination = state.combination;
      return;
    }
    const state = initTextState(filter, this.uniqueEntries());
    this.filterMode = state.filterMode;
    this.selectedLabels = state.selectedLabels;
    this.includeBlanks = state.includeBlanks;
    this.textGroups = state.textGroups;
    this.groupCombination = state.combination;
  }
}

const setField = <T, K extends keyof T>(
  arr: T[],
  index: number,
  key: K,
  value: T[K],
): void => {
  const item = arr[index];
  // Assign through `T` rather than the truthiness-narrowed `NonNullable<T>`;
  // the latter rejects the generic indexed value.
  if (item !== undefined) (item as T)[key] = value;
};
