export const GRID_BODY_TEMPLATE = `<div
  #scrollContainer
  style="height: 100%; overflow: auto; position: relative;"
  (scroll)="onScroll()">
    <div
      style="position: relative; min-width: 100%"
      [style.width.px]="innerWidth()"
      [style.height.px]="sizerHeight()">
      <div
        class="gp-grid-rows-wrapper"
        [style.width.px]="innerWidth()"
        [style.transform]="wrapperTransform()">
        @for (slot of slotsArray(); track slot.slotId) {
          @if (slot.rowIndex >= 0) {
            <div
              [class]="slot.rowKind === 'group' ? 'gp-grid-row gp-grid-row--group' : rowClass(slot.rowIndex, slot.rowData)"
              style="position: absolute; top: 0; left: 0"
              [style.transform]="'translateY(' + slot.translateY + 'px)'"
              [style.width.px]="innerWidth()"
              [style.height.px]="rowHeight()"
            >
              @if (slot.rowKind === 'group') {
                <div
                  class="gp-grid-row-group-cell"
                  [style.width.px]="innerWidth()"
                  [style.height.px]="rowHeight()"
                  [style.paddingLeft.px]="12 + ((slot.groupDepth ?? 0) * 16)"
                  (pointerdown)="$event.preventDefault(); toggleGroup(slot)">
                  {{ groupLabel(slot) }}
                </div>
              }
              @for (entry of columnLayout().items; track entry.key) {
                @if (slot.rowKind !== 'group') {
                @let editing = isEditing(slot.rowIndex, entry.originalIndex);
                <div
                  [class]="cellClassWithPinning(slot, entry)"
                  [ngStyle]="cellStyle(entry)"
                  [attr.data-row-index]="slot.rowIndex"
                  [attr.data-col-index]="entry.originalIndex"
                  (pointerdown)="cellPointerDown.emit({ rowIndex: slot.rowIndex, colIndex: entry.originalIndex, event: $event })"
                  (mouseenter)="cellPointerEnter.emit({ rowIndex: slot.rowIndex, colIndex: entry.originalIndex })"
                  (mouseleave)="cellPointerLeave.emit()"
                  (dblclick)="cellDoubleClick.emit({ rowIndex: slot.rowIndex, colIndex: entry.originalIndex })"
                >
                  @if (editing) {
                    @let etpl = editTemplate(entry.column);
                    @if (etpl) {
                      <ng-container
                        [ngTemplateOutlet]="etpl"
                        [ngTemplateOutletContext]="{ $implicit: editParams(slot.rowData, entry.column, slot.rowIndex, entry.originalIndex) }">
                      </ng-container>
                    } @else {
                      <input
                        class="gp-grid-edit-input"
                        type="text"
                        [value]="editInitialValue()"
                        autofocus
                        (focus)="onEditFocus($event)"
                        (input)="editValueChange.emit(asInput($event).value)"
                        (keydown)="onEditKeyDown($event)"
                        (blur)="editCommit.emit()" />
                    }
                  } @else {
                    @let tpl = cellTemplate(entry.column);
                    @if (tpl) {
                      <ng-container
                        [ngTemplateOutlet]="tpl"
                        [ngTemplateOutletContext]="{ $implicit: cellParams(slot.rowData, entry.column, slot.rowIndex, entry.originalIndex) }">
                      </ng-container>
                    } @else {
                      {{ cellDisplay(slot.rowData, entry.column, slot.rowIndex, entry.originalIndex) }}
                    }
                  }
                </div>
                }
              }
            </div>
          }
        }
        @if (fillHandlePosition(); as fhp) {
          @if (editingCell() === null) {
            <div
              class="gp-grid-fill-handle"
              [style.top.px]="fhp.top"
              [style.left.px]="fhp.left"
              (pointerdown)="fillHandlePointerDown.emit({ event: $event })">
            </div>
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
      <div class="gp-grid-empty">No data to display</div>
    }
  </div>
`;
