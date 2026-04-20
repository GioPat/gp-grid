import type { TemplateRef } from '@angular/core';
import type {
  ColumnDefinition,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
} from '@gp-grid/core';

/**
 * Column definition extended for Angular — allows `cellRenderer`,
 * `editRenderer`, and `headerRenderer` to be passed directly as
 * `TemplateRef` references in addition to the core's string-key / function
 * forms.
 */
export interface AngularColumnDefinition extends Omit<ColumnDefinition, 'cellRenderer' | 'editRenderer' | 'headerRenderer'> {
  cellRenderer?:
    | string
    | TemplateRef<{ $implicit: CellRendererParams }>
    | ((params: CellRendererParams) => unknown);
  editRenderer?:
    | string
    | TemplateRef<{ $implicit: EditRendererParams }>
    | ((params: EditRendererParams) => unknown);
  headerRenderer?:
    | string
    | TemplateRef<{ $implicit: HeaderRendererParams }>
    | ((params: HeaderRendererParams) => unknown);
}
