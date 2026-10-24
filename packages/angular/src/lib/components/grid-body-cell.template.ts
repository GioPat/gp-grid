export const GRID_BODY_CELL_TEMPLATE = `<ng-template #cellTpl let-slot="slot" let-entry="entry">
        @let editing = isEditing(slot.rowIndex, entry.layoutIndex);
        @let group = groupCell(slot.row, entry.columnId);
        @let groups = rowGroups();
        <div
          [class]="cellClass(slot.rowIndex, entry.layoutIndex, entry.column, slot.rowData, group)"
          role="gridcell"
          [attr.aria-colindex]="displayedIndexOf()(entry.columnId) + 1"
          [attr.data-cell-row]="slot.rowIndex"
          [attr.data-cell-col]="entry.layoutIndex"
          [attr.data-cell-region]="entry.region"
          [attr.title]="cellTitle(entry.column, editing, group)"
          [attr.aria-readonly]="group.readOnly ? 'true' : null"
          style="position: absolute; top: 0;"
          [style.inset-inline-start.px]="entry.regionOffset"
          [style.width.px]="entry.width"
          (pointerdown)="cellPointerDown.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex, event: $event })"
          (mouseenter)="cellPointerEnter.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex })"
          (mouseleave)="cellPointerLeave.emit()"
          (dblclick)="cellDoubleClick.emit({ rowIndex: slot.rowIndex, colIndex: entry.layoutIndex })"
        >
          @if (group.labelRow !== null && groups !== null) {
            <span gpGridGroupToggle
              [row]="group.labelRow"
              [rowIndex]="slot.rowIndex"
              [context]="groups"></span>
            <span gpGridGroupLabel
              [row]="group.labelRow"
              [rowIndex]="slot.rowIndex"
              [label]="group.label"
              [context]="groups"></span>
          } @else if (emptyGroupCell(slot, entry)) {
          } @else if (editing) {
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
                [ngTemplateOutletContext]="{ $implicit: cellParams(slot.rowData, entry.column, slot.rowIndex, entry.layoutIndex, slot.row?.kind) }">
              </ng-container>
            } @else {
              <span class="gp-grid-cell-content">{{ cellDisplay(slot.rowData, entry.column, slot.rowIndex, entry.layoutIndex, slot.row?.kind) }}</span>
            }
          }
          @if (rowResize() && editing === false) {
            <div
              gpGridResizeHandle
              [axis]="'row'"
              [index]="slot.rowIndex"
              [size]="slot.height"
              [resizing]="resizingRow() === slot.rowIndex"
              (resizePointerDown)="onRowResizePointerDown($event)"
              (resizeDoubleClick)="resizeDoubleClick.emit($event)">
            </div>
          }
        </div>
      </ng-template>`;
