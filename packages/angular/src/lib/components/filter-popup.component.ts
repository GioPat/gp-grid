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
import {
  calculateFilterPopupPosition,
  groupDistinctValues,
  isBlankCellValue,
  defaultGridLabels,
  formatLabel,
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
import { FILTER_POPUP_TEMPLATE } from './filter-popup.template';
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
  resolveColId,
} from './filter-popup/filter-logic';

@Component({
  selector: 'gp-grid-filter-popup',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: FILTER_POPUP_TEMPLATE,
})
export class FilterPopupComponent implements AfterViewInit, OnDestroy {
  @ViewChild('popupEl', { static: false }) popupEl!: ElementRef<HTMLDivElement>;

  column = input.required<ColumnDefinition>();
  colIndex = input.required<number>();
  anchorEl = input.required<HTMLElement>();
  distinctValues = input.required<CellValue[]>();
  currentFilter = input<ColumnFilterModel | undefined>(undefined);
  labels = input<GridLabels>(defaultGridLabels);

  apply = output<{ colId: string; filter: ColumnFilterModel | null }>();
  close = output<void>();

  popupTop = signal(0);
  popupLeft = signal(0);
  popupMinWidth = signal(200);
  positioned = signal(false);

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

  protected filterTitle(): string {
    const column = this.column();
    return formatLabel(this.labels().filterTitle, {
      column: column.headerName ?? column.field,
    });
  }

  protected readonly isValueLessTextOp = isValueLessTextOp;
  protected readonly isValueLessNumberOp = isValueLessNumberOp;

  constructor() {
    effect(() => {
      this.anchorEl();
      this.currentFilter();
      this.initFromCurrentFilter();
      // Update synchronously so the new column's anchor lands before paint,
      // not one frame later (which would briefly show the popup at the
      // previously-open column's position).
      this.updatePosition();
    });
  }

  ngAfterViewInit(): void {
    // Run once the popup element exists; the constructor effect may have run
    // before the view was ready and bailed.
    this.updatePosition();
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    });
    // Scroll events don't bubble, so listen in the capture phase on window to
    // catch scrolls from the grid body, the page, and any wrapping scroll
    // container in the host app.
    window.addEventListener('scroll', this.onWindowScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', this.onWindowScrollOrResize);
  }

  ngOnDestroy(): void {
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('scroll', this.onWindowScrollOrResize, { capture: true });
    window.removeEventListener('resize', this.onWindowScrollOrResize);
    if (this.repositionRafId !== null) cancelAnimationFrame(this.repositionRafId);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close.emit();
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
    this.apply.emit({
      colId: resolveColId(this.column()),
      filter: this.buildFilter(),
    });
  }

  handleClear(): void {
    this.apply.emit({ colId: resolveColId(this.column()), filter: null });
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

  private repositionRafId: number | null = null;

  private onWindowScrollOrResize = (): void => {
    if (this.repositionRafId !== null) return;
    this.repositionRafId = requestAnimationFrame(() => {
      this.repositionRafId = null;
      this.updatePosition();
    });
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
