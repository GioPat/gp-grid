# @gp-grid/angular 🏁 🏎️

<div align="center">
    <a href="https://www.gp-grid.io">
        <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-light.svg"/>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-dark.svg"/>
        <img width="50%" alt="gp-grid Logo" src="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-dark.svg"/>
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
pnpm add @gp-grid/angular @gp-grid/core
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

## License

Apache-2.0 — see [LICENSE](./LICENSE).
