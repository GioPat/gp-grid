import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ColumnFilterModel, FilterRendererParams } from '@gp-grid/angular';

const containsFilter = (value: string): ColumnFilterModel | null => {
  if (value.trim() === '') return null;
  return {
    groups: [{ conditions: [{ type: 'text', operator: 'contains', value }], combination: 'and' }],
    combination: 'and',
  };
};

/** Search box, cancel and apply only: replaces the built-in filter popup content. */
@Component({
  selector: 'app-search-filter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gp-grid-filter-content">
      <input
        #search
        class="gp-grid-filter-search"
        data-testid="custom-filter-input"
        autofocus
        [placeholder]="params().labels.searchPlaceholder"
        [value]="initialSearch()"
        (keydown.enter)="apply(search.value)" />
      <div class="gp-grid-filter-buttons">
        <button type="button" data-testid="custom-filter-cancel" (click)="params().close()">Cancel</button>
        <button type="button" class="gp-grid-filter-btn-apply" data-testid="custom-filter-apply" (click)="apply(search.value)">
          {{ params().labels.apply }}
        </button>
      </div>
    </div>
  `,
})
export class SearchFilterComponent {
  params = input.required<FilterRendererParams>();

  protected initialSearch(): string {
    const condition = this.params().currentFilter?.groups[0]?.conditions[0];
    return condition?.type === 'text' ? condition.value ?? '' : '';
  }

  protected apply(value: string): void {
    this.params().apply(containsFilter(value));
  }
}
