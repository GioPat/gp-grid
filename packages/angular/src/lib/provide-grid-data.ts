import type { Provider } from "@angular/core";
import {
  GRID_DATA_OPTIONS,
  GridDataService,
  type GridDataOptions,
} from "./grid-data.service";

/**
 * Returns the providers needed to bind a {@link GridDataService} to the
 * current injector (typically a component's `providers` array). The service
 * is scoped to that injector — registering it on a parent injector would
 * silently share the underlying data source between children.
 *
 * @example
 * ```ts
 * @Component({
 *   providers: [provideGridData<Person>({ getRowId: (r) => r.id, initialData: rows })],
 * })
 * export class MyGridComponent {
 *   protected readonly grid = injectGridData<Person>();
 * }
 * ```
 */
export const provideGridData = <TData>(
  options: GridDataOptions<TData>,
): Provider[] => [
  { provide: GRID_DATA_OPTIONS, useValue: options },
  GridDataService,
];
