export const FILTER_POPUP_TEMPLATE = `
<div
  #popupEl
  class="gp-grid-filter-popup"
  [style.position]="'fixed'"
  [style.zIndex]="10000"
  [style.top.px]="popupTop()"
  [style.left.px]="popupLeft()"
  [style.minWidth.px]="popupMinWidth()"
  [style.visibility]="positioned() ? 'visible' : 'hidden'"
  (keydown.escape)="close.emit()"
  (click)="$event.stopPropagation()">

  <div class="gp-grid-filter-header">
    {{ filterTitle() }}
  </div>

  @if (customTemplate(); as template) {
    <!-- Single-item loop keyed by column: recreates the view, and its state, per column. -->
    @for (columnId of [rendererParams().columnId]; track columnId) {
      <ng-container
        [ngTemplateOutlet]="template"
        [ngTemplateOutletContext]="{ $implicit: rendererParams() }" />
    }
  } @else {
    <gp-grid-filter-content
      [column]="column()"
      [distinctValues]="distinctValues()"
      [currentFilter]="currentFilter()"
      [labels]="labels()"
      (apply)="applyFilter($event)" />
  }
</div>
`;
