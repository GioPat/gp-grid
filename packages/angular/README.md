# @gp-grid/angular 🏁 🏎️

<div align="center">
    <a href="https://www.gp-grid.io">
        <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://www.gp-grid.io/logo-light.svg"/>
        <source media="(prefers-color-scheme: light)" srcset="https://www.gp-grid.io/logo-dark.svg"/>
        <img width="50%" alt="gp-grid Logo" src="https://www.gp-grid.io/logo-dark.svg"/>
        </picture>
    </a>
    <div align="center">
     Logo by <a href="https://github.com/camillo18tre">camillo18tre ❤️</a>
      <h4><a href="https://www.gp-grid.io/">🎮 Demo</a> • <a href="https://www.gp-grid.io/docs/angular">📖 Documentation</a> • <a href="https://deepwiki.com/GioPat/gp-grid"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"/></a></h4>
    </div>
</div>

A high-performance, feature-lean Angular data grid built to handle millions of rows. Thin wrapper around [`@gp-grid/core`](https://www.npmjs.com/package/@gp-grid/core) — virtual scrolling, cell selection, sorting, filtering, editing, and Excel-like fill handle, with a standalone `gp-grid` component driven by Angular signals.

## Installation

```bash
pnpm add @gp-grid/angular
```

Peer requirements: `@angular/common` and `@angular/core` `>=18.0.0`.

## Quick Start

```ts
import { Component } from "@angular/core";
import { GpGridComponent, createGridData } from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";

interface Person {
  id: number;
  name: string;
  age: number;
}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [GpGridComponent],
  template: `
    <gp-grid
      [columns]="columns"
      [dataSource]="grid.dataSource"
      [rowHeight]="36" />
  `,
})
export class App {
  protected readonly grid = createGridData<Person>(
    [
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: 25 },
    ],
    { getRowId: (row) => row.id },
  );

  protected readonly columns: AngularColumnDefinition[] = [
    { field: "id", cellDataType: "number", headerName: "ID", width: 80 },
    { field: "name", cellDataType: "text", headerName: "Name", width: 200 },
    { field: "age", cellDataType: "number", headerName: "Age", width: 100 },
  ];
}
```

Import the stylesheet once (e.g. in `styles.css` or `angular.json`):

```css
@import "@gp-grid/angular/dist/styles.css";
```

For custom cell, edit, and header renderers, pass `ng-template` references via the column `cellRenderer` / `editRenderer` / `headerRenderer` fields — see the [Angular docs](https://www.gp-grid.io/docs/angular) for the full API.

## Dependency injection

For components that want lifecycle-managed cleanup or testable seams, use `provideGridData` and `injectGridData`. They wire the same mutable data source through Angular's DI, mirroring `useGridData` in `@gp-grid/react` and `@gp-grid/vue`. The service implements `OnDestroy` and clears the data source automatically when the component is destroyed.

```ts
import { Component } from "@angular/core";
import {
  GpGridComponent,
  provideGridData,
  injectGridData,
} from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";

interface Person {
  id: number;
  name: string;
  age: number;
}

const initialRows: Person[] = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
];

@Component({
  selector: "app-root",
  standalone: true,
  imports: [GpGridComponent],
  providers: [
    provideGridData<Person>({
      getRowId: (row) => row.id,
      initialData: initialRows,
    }),
  ],
  template: `
    <gp-grid
      [columns]="columns"
      [dataSource]="grid.dataSource"
      [rowHeight]="36" />
    <button (click)="grid.addRows([{ id: 3, name: 'Carol', age: 28 }])">Add</button>
  `,
})
export class App {
  protected readonly grid = injectGridData<Person>();

  protected readonly columns: AngularColumnDefinition[] = [
    { field: "id", cellDataType: "number", headerName: "ID", width: 80 },
    { field: "name", cellDataType: "text", headerName: "Name", width: 200 },
    { field: "age", cellDataType: "number", headerName: "Age", width: 100 },
  ];
}
```

`provideGridData` returns a standard Angular `Provider[]`, so it composes with other `provide*` functions in the component's `providers` array. Register it on the consuming component (not on a parent injector) so each component instance gets its own data source.

## Column state and events

`columnState` is an optional input of type `ColumnStateUpdate[]` — `{ columnId, width?, hidden?, order? }` — applied through the core whenever it changes.

| Output | Payload |
| --- | --- |
| `(onColumnResized)` | `{ columnId, width, viewIndex }` |
| `(onColumnMoved)` | `{ columnId, fromViewIndex, toViewIndex }` |
| `(onRowDragEnd)` | `{ rowId, fromViewIndex, toViewIndex }` |
| `(onCellValueChanged)` | `CellValueChangedEvent<TData>`; it gained `columnId`, and `colIndex` is the current view column index |

```html
<gp-grid
  [columns]="columns"
  [columnState]="columnState"
  [dataSource]="grid.dataSource"
  [rowHeight]="36"
  (onColumnResized)="onResized($event)"
  (onColumnMoved)="onMoved($event)" />
```

### Migration from 0.x

The old payloads `{ colIndex, newWidth }`, `{ fromIndex, toIndex }` and `{ source, target }` became `{ columnId, width, viewIndex }`, `{ columnId, fromViewIndex, toViewIndex }` and `{ rowId, fromViewIndex, toViewIndex }`. There is no compatibility adapter.

Reassigning `columns` reconciles the schema by `ColumnId` (`colId ?? field`) without recreating the core: retained columns keep their user width/order/visibility, unrelated sort/filter/scroll survives, and removed columns drop their headers and state. A definition `width`/`hidden` change only applies when the column has no user override for that property; otherwise call `resetColumnState(["id"])` on the exposed core.

The public website documentation for this package lives outside this repository and should be updated by the maintainer.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
