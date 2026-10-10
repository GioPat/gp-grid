import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { groupLabelParams, groupToggleClassName } from '@gp-grid/core';
import type { HierarchyGroupRow, HierarchyTotalRow } from '@gp-grid/core';
import type { RowGroupCellContext } from './row-group-cells';

/**
 * The expander of a group or total row's label cell. Attribute selectors keep
 * the DOM of the other wrappers: the expander and the label are the cell's children.
 */
@Component({
  selector: 'span[gpGridGroupToggle]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    'aria-hidden': 'true',
    '[class]': 'className()',
    '(pointerdown)': 'onPointerDown($event)',
    '(dblclick)': 'onDoubleClick($event)',
  },
})
export class GroupToggleComponent {
  row = input.required<HierarchyGroupRow | HierarchyTotalRow>();
  rowIndex = input.required<number>();
  context = input.required<RowGroupCellContext>();

  protected className = computed(() => groupToggleClassName(this.row()));

  protected onPointerDown(event: PointerEvent): void {
    if (this.row().kind === 'group') this.context().onTogglePointerDown(this.rowIndex(), event);
  }

  // The cell's own double-click toggles too, so a double-click on the expander
  // must not reach it after its two pointer downs already toggled.
  protected onDoubleClick(event: MouseEvent): void {
    event.stopPropagation();
  }
}

/** The label of a group or total row: the formatted text or `groupLabelRenderer`. */
@Component({
  selector: 'span[gpGridGroupLabel]',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'gp-grid-group-label' },
  template: `@if (context().renderer; as tpl) {<ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: params() }" />} @else {<ng-container>{{ label() }}</ng-container>}`,
})
export class GroupLabelComponent {
  row = input.required<HierarchyGroupRow | HierarchyTotalRow>();
  rowIndex = input.required<number>();
  label = input.required<string>();
  context = input.required<RowGroupCellContext>();

  protected params = computed(() =>
    groupLabelParams(this.row(), this.rowIndex(), this.label(), this.context().onToggle));
}
