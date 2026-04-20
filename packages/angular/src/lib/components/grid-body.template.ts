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
              [class]="rowClass(slot.rowIndex, slot.rowData)"
              style="position: absolute; top: 0; left: 0"
              [style.transform]="'translateY(' + slot.translateY + 'px)'"
              [style.width.px]="innerWidth()"
              [style.height.px]="rowHeight()"
            >
              @for (entry of visibleColumnWithIndices(); track entry.originalIndex; let i = $index) {
                @let editing = isEditing(slot.rowIndex, entry.originalIndex);
                <div
                  [class]="cellClass(slot.rowIndex, entry.originalIndex, entry.column, slot.rowData)"
                  style="position: absolute; top: 0;"
                  [attr.data-row-index]="slot.rowIndex"
                  [attr.data-col-index]="entry.originalIndex"
                  [style.left.px]="columnPositions()[i]"
                  [style.width.px]="columnWidths()[i]"
                  [style.height.px]="rowHeight()"
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
