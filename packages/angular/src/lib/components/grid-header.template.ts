export const GRID_HEADER_TEMPLATE = `
  <div
    class="gp-grid-header"
    [class.gp-grid-header--loading]="isLoading()"
    [attr.role]="rootRole()"
    [attr.aria-rowindex]="rootRowIndex()"
    [style.height.px]="totalHeight()">
    @for (owns of associations()?.owns ?? []; track $index) {
      <div role="row" [attr.aria-rowindex]="$index + 1" [attr.aria-owns]="owns || null"></div>
    }
    <ng-template #fragmentTpl let-fragment="fragment">
      @let box = fragmentBox(fragment.band);
      @let group = groupOf(fragment.groupId);
      @let groupTpl = groupTemplate(group);
      <div
        [attr.id]="fragmentId(fragment.fragmentId)"
        class="gp-grid-header-cell gp-grid-header-group"
        [class.gp-grid-header-cell--wrap]="group?.wrapHeaderText === true"
        role="columnheader"
        [attr.aria-colindex]="fragment.firstDisplayIndex + 1"
        [attr.aria-colspan]="fragment.leafCount"
        [attr.aria-rowindex]="fragment.band + 1"
        [attr.data-group-id]="fragment.groupId"
        [attr.data-band]="fragment.band"
        [attr.data-fragment]="fragment.fragmentId"
        [style.inset-inline-start.px]="fragment.regionOffset"
        [style.width.px]="fragment.width"
        [style.height.px]="box.height"
        [style.top.px]="box.top">
        @if (group && groupTpl) {
          <ng-container
            [ngTemplateOutlet]="groupTpl"
            [ngTemplateOutletContext]="{ $implicit: groupParams(fragment, group) }">
          </ng-container>
        } @else {
          <span class="gp-grid-header-text">{{ group?.headerName ?? fragment.groupId }}</span>
        }
      </div>
    </ng-template>
    <ng-template #headerCellTpl let-entry="entry">
      @let colW = entry.width;
      @let headerData = headers().get(entry.columnId);
      @let tpl = headerTemplate(entry.column);
      @let box = leafBox(entry.headerBand);
      @let bands = leafBands(entry);
      <div
        [attr.id]="leafId(entry.columnId)"
        class="gp-grid-header-cell"
        [class.gp-grid-header-cell--wrap]="entry.column.wrapHeaderText === true"
        role="columnheader"
        [attr.aria-colindex]="displayedIndexOf()(entry.columnId) + 1"
        [attr.aria-rowindex]="bands?.rowIndex"
        [attr.aria-rowspan]="bands?.rowSpan"
        [attr.aria-describedby]="bands?.describedBy"
        [attr.data-col-index]="entry.layoutIndex"
        [attr.data-cell-region]="entry.region"
        [style.inset-inline-start.px]="entry.regionOffset"
        [style.width.px]="colW"
        [style.height.px]="box.height"
        [style.top.px]="box.top"
        (pointerdown)="onHeaderPointerDown($event, entry.layoutIndex, colW, box.height)">
        @if (tpl) {
          <ng-container
            [ngTemplateOutlet]="tpl"
            [ngTemplateOutletContext]="{ $implicit: headerParams(entry.column, entry.layoutIndex, headerData) }">
          </ng-container>
        } @else {
          <button
            type="button"
            class="gp-grid-pin-button"
            [class.active]="entry.column.pinned"
            [attr.aria-label]="nextPinLabel(entry.column.pinned ?? null)"
            [attr.aria-pressed]="entry.column.pinned ? 'true' : 'false'"
            [title]="nextPinLabel(entry.column.pinned ?? null)"
            (pointerdown)="onPinPointerDown($event)"
            (click)="onPinClick($event, entry.columnId, entry.column.pinned ?? null)">
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              [attr.viewBox]="pinIcon().viewBox ?? '0 0 24 24'">
              <path [attr.d]="pinIcon().path" fill="currentColor"/>
            </svg>
          </button>
          <span class="gp-grid-header-text">{{ entry.column.headerName ?? entry.column.field }}</span>
        }
        <span class="gp-grid-header-icons">
          @if (sortingEnabled() && entry.column.sortable !== false) {
            <span class="gp-grid-sort-arrows">
              <span class="gp-grid-sort-arrows-stack">
                <svg
                  [class]="'gp-grid-sort-arrow-up' + (headerData?.sortDirection === 'asc' ? ' active' : '')"
                  width="8" height="6" viewBox="0 0 8 6">
                  <path d="M4 0L8 6H0L4 0Z" fill="currentColor"/>
                </svg>
                <svg
                  [class]="'gp-grid-sort-arrow-down' + (headerData?.sortDirection === 'desc' ? ' active' : '')"
                  width="8" height="6" viewBox="0 0 8 6">
                  <path d="M4 6L0 0H8L4 6Z" fill="currentColor"/>
                </svg>
              </span>
              @if ((headerData?.sortIndex ?? 0) > 0) {
                <span class="gp-grid-sort-index">{{ headerData?.sortIndex }}</span>
              }
            </span>
          }
          @if (entry.column.filterable !== false) {
            <span
              [class]="'gp-grid-filter-icon' + (headerData?.hasFilter ? ' active' : '')"
              (pointerdown)="onFilterPointerDown($event, entry.layoutIndex)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h16l-6 8v5l-4 2v-7L4 4z"/>
              </svg>
            </span>
          }
        </span>
        @if (entry.column.resizable !== false) {
          <div
            gpGridResizeHandle
            [axis]="'column'"
            [index]="entry.layoutIndex"
            [size]="colW"
            (resizePointerDown)="onResizePointerDown($event)"
            (resizeDoubleClick)="resizeDoubleClick.emit($event)">
          </div>
        }
      </div>
    </ng-template>
    <div
      style="position: absolute; top: 0; inset-inline-start: 0;"
      role="presentation"
      [style.transform]="transformStyle()"
      [style.width.px]="innerWidth()"
      [style.height.px]="totalHeight()">
      @for (fragment of groups().center; track fragment.fragmentId) {
        <ng-container
          [ngTemplateOutlet]="fragmentTpl"
          [ngTemplateOutletContext]="{ fragment: fragment }">
        </ng-container>
      }
      @for (entry of centerColumns(); track entry.columnId) {
        <ng-container
          [ngTemplateOutlet]="headerCellTpl"
          [ngTemplateOutletContext]="{ entry: entry }">
        </ng-container>
      }
    </div>
    @if (startColumns().length > 0) {
      <div
        class="gp-grid-pin-header"
        role="presentation"
        data-pin-region="start"
        style="inset-inline-start: 0;"
        [style.width.px]="startWidth()"
        [style.height.px]="totalHeight()">
        @for (fragment of groups().start; track fragment.fragmentId) {
          <ng-container
            [ngTemplateOutlet]="fragmentTpl"
            [ngTemplateOutletContext]="{ fragment: fragment }">
          </ng-container>
        }
        @for (entry of startColumns(); track entry.columnId) {
          <ng-container
            [ngTemplateOutlet]="headerCellTpl"
            [ngTemplateOutletContext]="{ entry: entry }">
          </ng-container>
        }
      </div>
    }
    @if (endColumns().length > 0) {
      <div
        class="gp-grid-pin-header"
        role="presentation"
        data-pin-region="end"
        [style.inset-inline-start.px]="endOffset()"
        [style.width.px]="endWidth()"
        [style.height.px]="totalHeight()">
        @for (fragment of groups().end; track fragment.fragmentId) {
          <ng-container
            [ngTemplateOutlet]="fragmentTpl"
            [ngTemplateOutletContext]="{ fragment: fragment }">
          </ng-container>
        }
        @for (entry of endColumns(); track entry.columnId) {
          <ng-container
            [ngTemplateOutlet]="headerCellTpl"
            [ngTemplateOutletContext]="{ entry: entry }">
          </ng-container>
        }
      </div>
    }
    @if (viewportWidth() > 0) {
      <div
        class="gp-grid-header-gutter"
        role="presentation"
        [style.inset-inline-start.px]="viewportWidth()"
        [style.height.px]="totalHeight()">
      </div>
    }
  </div>
`;
