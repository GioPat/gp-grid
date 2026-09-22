export const GRID_BODY_TEMPLATE = `<div
  #scrollContainer
  class="gp-grid-body-scroll"
  style="height: 100%; width: 100%; min-width: 0; overflow: auto; position: relative;"
  role="presentation"
  (scroll)="onScroll()">
    <div
      style="position: relative; min-width: 100%"
      role="presentation"
      [style.width.px]="innerWidth()"
      [style.height.px]="sizerHeight()">
      <div
        class="gp-grid-rows-wrapper"
        role="presentation"
        [style.width.px]="innerWidth()"
        [style.transform]="wrapperTransform()">
        <ng-template #cellTpl let-slot="slot" let-entry="entry">
          @let editing = isEditing(slot.rowIndex, entry.layoutIndex);
          <div
            [class]="cellClass(slot.rowIndex, entry.layoutIndex, entry.column, slot.rowData)"
            role="gridcell"
            [attr.aria-colindex]="displayedIndexOf()(entry.columnId) + 1"
            [attr.data-cell-row]="slot.rowIndex"
            [attr.data-cell-col]="entry.layoutIndex"
            [attr.data-cell-region]="entry.region"
            style="position: absolute; top: 0;"
            [style.inset-inline-start.px]="entry.regionOffset"
            [style.width.px]="entry.width"
            [style.height.px]="rowHeight()"
            (pointerdown)="cellPointerDown.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex, event: $event })"
            (mouseenter)="cellPointerEnter.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex })"
            (mouseleave)="cellPointerLeave.emit()"
            (dblclick)="cellDoubleClick.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex })"
          >
            @if (editing) {
              @let etpl = editTemplate(entry.column);
              @if (etpl) {
                <ng-container
                  [ngTemplateOutlet]="etpl"
                  [ngTemplateOutletContext]="{ $implicit: editParams(slot.rowData, entry.column, slot.rowIndex, entry.layoutIndex) }">
                </ng-container>
              } @else {
                <input
                  class="gp-grid-edit-input"
                  type="text"
                  [attr.data-edit-id]="editingCell()?.editId"
                  [value]="editInitialValue()"
                  autofocus
                  (focus)="onEditFocus($event)"
                  (input)="editValueChange.emit(asInput($event).value)"
                  (keydown)="onEditKeyDown($event)"
                  (blur)="onEditBlur($event)" />
              }
            } @else {
              @let tpl = cellTemplate(entry.column);
              @if (tpl) {
                <ng-container
                  [ngTemplateOutlet]="tpl"
                  [ngTemplateOutletContext]="{ $implicit: cellParams(slot.rowData, entry.column, slot.rowIndex, entry.layoutIndex) }">
                </ng-container>
              } @else {
                <span class="gp-grid-cell-content">{{ cellDisplay(slot.rowData, entry.column, slot.rowIndex, entry.layoutIndex) }}</span>
              }
            }
          </div>
        </ng-template>
        @for (slot of slotsArray(); track slot.slotId) {
          @if (slot.rowIndex >= 0) {
            <div
              [class]="rowClass(slot.rowIndex, slot.rowData)"
              role="row"
              [attr.aria-rowindex]="slot.rowIndex + 1"
              style="position: absolute; top: 0; inset-inline-start: 0; display: flex;"
              [style.transform]="'translateY(' + slot.translateY + 'px)'"
              [style.width.px]="innerWidth()"
              [style.height.px]="rowHeight()"
            >
              @for (entry of centerColumns(); track entry.columnId) {
                <ng-container
                  [ngTemplateOutlet]="cellTpl"
                  [ngTemplateOutletContext]="{ slot: slot, entry: entry }">
                </ng-container>
              }
              @if (startColumns().length > 0) {
                <div
                  class="gp-grid-pin gp-grid-pin--start"
                  role="presentation"
                  data-pin-region="start"
                  [style.width.px]="startWidth()">
                  @for (entry of startColumns(); track entry.columnId) {
                    <ng-container
                      [ngTemplateOutlet]="cellTpl"
                      [ngTemplateOutletContext]="{ slot: slot, entry: entry }">
                    </ng-container>
                  }
                </div>
              }
              @if (endColumns().length > 0) {
                <div
                  class="gp-grid-pin gp-grid-pin--end"
                  role="presentation"
                  data-pin-region="end"
                  [style.width.px]="endWidth()">
                  @for (entry of endColumns(); track entry.columnId) {
                    <ng-container
                      [ngTemplateOutlet]="cellTpl"
                      [ngTemplateOutletContext]="{ slot: slot, entry: entry }">
                    </ng-container>
                  }
                </div>
              }
            </div>
          }
        }
        @if (fillHandlePosition(); as fhp) {
          @if (editingCell() === null) {
            @if (fhp.region === 'center') {
              <div
                class="gp-grid-fill-handle"
                [style.top.px]="fhp.top"
                [style.inset-inline-start.px]="fhp.left"
                (pointerdown)="fillHandlePointerDown.emit({ event: $event })">
              </div>
            } @else {
              <div
                class="gp-grid-pin-overlay"
                [class]="'gp-grid-pin-overlay--' + fhp.region"
                role="presentation"
                [style.width.px]="fhp.region === 'end' ? endWidth() : startWidth()">
                <div
                  class="gp-grid-fill-handle"
                  [style.top.px]="fhp.top"
                  [style.inset-inline-start.px]="fhp.left"
                  (pointerdown)="fillHandlePointerDown.emit({ event: $event })">
                </div>
              </div>
            }
          }
        }
        @if (rowDropIndicator(); as rd) {
          <div
            class="gp-grid-row-drop-indicator"
            [style.transform]="'translateY(' + rd.dropIndicatorY + 'px)'"
            [style.width.px]="rowDropIndicatorWidth()"></div>
        }
      </div>
    </div>
    @if (totalRows() === 0) {
      <div class="gp-grid-empty">{{ labels().emptyState }}</div>
    }
  </div>
`;
