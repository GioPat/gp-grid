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
  (click)="$event.stopPropagation()">

  <div class="gp-grid-filter-header">
    {{ filterTitle() }}
  </div>

  @if (customRenderer(); as renderer) {
    <!-- Single-item loop keyed by column: recreates the view, and its state, per column. -->
    @for (columnId of [rendererParams().columnId]; track columnId) {
      <ng-container
        [ngTemplateOutlet]="renderer.content"
        [ngTemplateOutletContext]="{ $implicit: rendererParams() }" />
      @if (renderer.clear !== null) {
        <div class="gp-grid-filter-clear">
          @if (clearTemplate(); as clear) {
            <ng-container [ngTemplateOutlet]="clear" [ngTemplateOutletContext]="{ $implicit: clearParams() }" />
          } @else {
            <button type="button" class="gp-grid-filter-btn-clear" (click)="applyFilter(null)">
              {{ labels().clear }}
            </button>
          }
        </div>
      }
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
