import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  effect,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { calculateFilterPopupPosition } from '@gp-grid/core';
import type {
  ColumnDefinition,
  CellValue,
  ColumnFilterModel,
} from '@gp-grid/core';
import { FILTER_POPUP_TEMPLATE } from './filter-popup.template';
import {
  MAX_CHECKBOX_VALUES,
  NUMBER_OPERATORS,
  TEXT_OPERATORS,
  type FilterMode,
  type NumberConditionState,
  type TextConditionState,
  buildNumberFilter,
  buildTextFilter,
  computeUniqueValues,
  defaultNumberCondition,
  defaultTextCondition,
  initNumberConditions,
  initTextState,
  isNumberColumn as columnIsNumber,
  isValueLessNumberOp,
  isValueLessTextOp,
  resolveColId,
} from './filter-popup/filter-logic';

@Component({
  selector: 'gp-grid-filter-popup',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: FILTER_POPUP_TEMPLATE,
})
export class FilterPopupComponent implements AfterViewInit, OnDestroy {
  @ViewChild('popupEl', { static: false }) popupEl!: ElementRef<HTMLDivElement>;

  column = input.required<ColumnDefinition>();
  colIndex = input.required<number>();
  anchorEl = input.required<HTMLElement>();
  distinctValues = input.required<CellValue[]>();
  currentFilter = input<ColumnFilterModel | undefined>(undefined);

  apply = output<{ colId: string; filter: ColumnFilterModel | null }>();
  close = output<void>();

  popupTop = signal(0);
  popupLeft = signal(0);
  popupMinWidth = signal(200);
  positioned = signal(false);

  filterMode: FilterMode = 'values';
  searchText = '';
  selectedValues = new Set<string>();
  includeBlanks = true;
  textConditions: TextConditionState[] = [defaultTextCondition()];
  numberConditions: NumberConditionState[] = [defaultNumberCondition()];

  readonly textOperators = TEXT_OPERATORS;
  readonly numberOperators = NUMBER_OPERATORS;

  protected readonly isValueLessTextOp = isValueLessTextOp;
  protected readonly isValueLessNumberOp = isValueLessNumberOp;

  constructor() {
    effect(() => {
      this.anchorEl();
      this.currentFilter();
      this.initFromCurrentFilter();
      requestAnimationFrame(() => this.updatePosition());
    });
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    });
    window.addEventListener('resize', this.onWindowResize);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('resize', this.onWindowResize);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close.emit();
  }

  isNumberColumn(): boolean {
    return columnIsNumber(this.column());
  }

  showValuesMode(): boolean {
    return this.uniqueValues().length <= MAX_CHECKBOX_VALUES;
  }

  uniqueValues(): string[] {
    return computeUniqueValues(this.distinctValues());
  }

  filteredUniqueValues(): string[] {
    const search = this.searchText.toLowerCase();
    if (!search) return this.uniqueValues();
    return this.uniqueValues().filter(v => v.toLowerCase().includes(search));
  }

  toggleValue(val: string, checked: boolean): void {
    if (checked) {
      this.selectedValues.add(val);
    } else {
      this.selectedValues.delete(val);
    }
  }

  selectAll(): void {
    this.includeBlanks = true;
    for (const v of this.uniqueValues()) this.selectedValues.add(v);
  }

  deselectAll(): void {
    this.includeBlanks = false;
    this.selectedValues.clear();
  }

  onTextOperatorChange(index: number, value: string): void {
    setField(this.textConditions, index, 'operator', value);
  }

  onNumberOperatorChange(index: number, value: string): void {
    setField(this.numberConditions, index, 'operator', value);
  }

  addTextCondition(): void {
    this.textConditions.push(defaultTextCondition());
  }

  addNumberCondition(): void {
    this.numberConditions.push(defaultNumberCondition());
  }

  removeTextCondition(index: number): void {
    this.textConditions.splice(index, 1);
  }

  removeNumberCondition(index: number): void {
    this.numberConditions.splice(index, 1);
  }

  setTextNextOp(index: number, value: 'and' | 'or'): void {
    setField(this.textConditions, index, 'nextOperator', value);
  }

  setNumberNextOp(index: number, value: 'and' | 'or'): void {
    setField(this.numberConditions, index, 'nextOperator', value);
  }

  handleApply(): void {
    this.apply.emit({
      colId: resolveColId(this.column()),
      filter: this.buildFilter(),
    });
  }

  handleClear(): void {
    this.apply.emit({ colId: resolveColId(this.column()), filter: null });
  }

  private buildFilter(): ColumnFilterModel | null {
    if (this.isNumberColumn()) return buildNumberFilter(this.numberConditions);
    return buildTextFilter({
      filterMode: this.filterMode,
      uniqueValues: this.uniqueValues(),
      selectedValues: this.selectedValues,
      includeBlanks: this.includeBlanks,
      textConditions: this.textConditions,
    });
  }

  private initFromCurrentFilter(): void {
    const filter = this.currentFilter();
    if (this.isNumberColumn()) {
      this.numberConditions = initNumberConditions(filter);
      return;
    }
    const state = initTextState(filter, this.uniqueValues());
    this.filterMode = state.filterMode;
    this.selectedValues = state.selectedValues;
    this.includeBlanks = state.includeBlanks;
    this.textConditions = state.textConditions;
  }

  private updatePosition(): void {
    if (!this.popupEl?.nativeElement) return;
    const pos = calculateFilterPopupPosition(this.anchorEl(), this.popupEl.nativeElement);
    this.popupTop.set(pos.top);
    this.popupLeft.set(pos.left);
    this.popupMinWidth.set(pos.minWidth);
    this.positioned.set(true);
  }

  private onDocumentPointerDown = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest('.gp-grid-filter-icon')) return;
    if (this.popupEl?.nativeElement?.contains(target)) return;
    this.close.emit();
  };

  private onWindowResize = (): void => {
    this.updatePosition();
  };
}

const setField = <T, K extends keyof T>(
  arr: T[],
  index: number,
  key: K,
  value: T[K],
): void => {
  const item = arr[index];
  if (item) item[key] = value;
};
