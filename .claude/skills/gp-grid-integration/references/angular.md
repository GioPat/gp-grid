# Integrating gp-grid in an Angular app

This file is the Angular-specific reference. Cross-framework concepts (column shape, data source choice, features, programmatic API, gotchas) live in `SKILL.md` — read that first if you haven't.

## Install

```bash
pnpm add @gp-grid/angular       # or npm install / yarn add / bun add
```

Peer requirements: `@angular/common` and `@angular/core` `>= 18.0.0` (signals + standalone components are required).

Import the stylesheet **once**. Either in a global stylesheet:

```css
/* src/styles.css */
@import "@gp-grid/angular/dist/styles.css";
```

…or list it in `angular.json` under `architect.build.options.styles`:

```json
"styles": [
  "src/styles.css",
  "node_modules/@gp-grid/angular/dist/styles.css"
]
```

## Minimal grid

```ts
import { Component } from "@angular/core";
import { GpGridComponent } from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";

interface Person {
  id: number;
  name: string;
  age: number;
}

@Component({
  selector: "app-people-grid",
  standalone: true,
  imports: [GpGridComponent],
  template: `
    <div style="width: 100%; height: 400px">
      <gp-grid
        [columns]="columns"
        [rows]="rows"
        [rowHeight]="36"
      />
    </div>
  `,
})
export class PeopleGridComponent {
  protected readonly rows: Person[] = [
    { id: 1, name: "Alice", age: 30 },
    { id: 2, name: "Bob",   age: 25 },
  ];

  protected readonly columns: AngularColumnDefinition[] = [
    { field: "id",   cellDataType: "number", headerName: "ID",   width: 80 },
    { field: "name", cellDataType: "text",   headerName: "Name", width: 200 },
    { field: "age",  cellDataType: "number", headerName: "Age",  width: 100 },
  ];
}
```

`GpGridComponent` is a **standalone** component — import it directly in your component's `imports` array (no `NgModule` needed). The `<gp-grid>` selector exists. The host element must be wrapped in (or be) something with explicit dimensions.

`AngularColumnDefinition` extends the core's `ColumnDefinition` to also accept `TemplateRef` for renderers — see "Custom renderers" below. For columns without custom renderers, the two are interchangeable.

## Mutable data — `createGridData` (simplest)

For one-off use within a component:

```ts
import { Component } from "@angular/core";
import { GpGridComponent, createGridData } from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";

@Component({
  selector: "app-people-grid",
  standalone: true,
  imports: [GpGridComponent],
  template: `
    <div style="width: 100%; height: 400px">
      <gp-grid
        [columns]="columns"
        [dataSource]="grid.dataSource"
        [rowHeight]="36"
      />
    </div>
    <button (click)="grid.addRows([{ id: 99, name: 'Carol', age: 28 }])">Add</button>
    <button (click)="grid.updateRow(1, { age: 31 })">Bump Alice</button>
  `,
})
export class PeopleGridComponent {
  protected readonly grid = createGridData<Person>(
    [
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob",   age: 25 },
    ],
    { getRowId: (row) => row.id },
  );

  protected readonly columns: AngularColumnDefinition[] = [/* ... */];
}
```

`createGridData` returns `{ dataSource, updateRow, addRows, removeRows, updateCell, clear, getRowById, getTotalRowCount, flushTransactions }`. `getRowId` is required for any mutation.

## Mutable data — `provideGridData` + `injectGridData` (DI-friendly)

For lifecycle-managed cleanup, testability, or sharing the same data source across nested components, use Angular DI:

```ts
import { Component } from "@angular/core";
import {
  GpGridComponent,
  provideGridData,
  injectGridData,
} from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";

@Component({
  selector: "app-people-grid",
  standalone: true,
  imports: [GpGridComponent],
  providers: [
    provideGridData<Person>({
      getRowId: (row) => row.id,
      initialData: [
        { id: 1, name: "Alice", age: 30 },
        { id: 2, name: "Bob",   age: 25 },
      ],
    }),
  ],
  template: `
    <div style="width: 100%; height: 400px">
      <gp-grid
        [columns]="columns"
        [dataSource]="grid.dataSource"
        [rowHeight]="36"
      />
    </div>
    <button (click)="grid.addRows([{ id: 99, name: 'Carol', age: 28 }])">Add</button>
  `,
})
export class PeopleGridComponent {
  protected readonly grid = injectGridData<Person>();
  protected readonly columns: AngularColumnDefinition[] = [/* ... */];
}
```

Register `provideGridData` on the **consuming component** (not in a parent injector or `bootstrapApplication`) so each component instance gets its own data source. The service implements `OnDestroy` and clears the data source automatically.

## Server data — `createServerDataSource`

```ts
import { Component, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  GpGridComponent,
  createServerDataSource,
  type DataSourceRequest,
  type DataSourceResponse,
} from "@gp-grid/angular";
import type { AngularColumnDefinition } from "@gp-grid/angular";
import { firstValueFrom } from "rxjs";

interface User { id: number; name: string; email: string }

@Component({
  selector: "app-users-grid",
  standalone: true,
  imports: [GpGridComponent],
  template: `
    <div style="width: 100%; height: 600px">
      <gp-grid
        [columns]="columns"
        [dataSource]="dataSource"
        [rowHeight]="36"
      />
    </div>
  `,
})
export class UsersGridComponent {
  private readonly http = inject(HttpClient);

  protected readonly dataSource = createServerDataSource<User>(async (req: DataSourceRequest) => {
    // DataSourceRequest exposes `range: { startRow, endRow }` (endRow exclusive),
    // NOT a `pagination` field. Derive page/pageSize from the range.
    const pageSize = req.range.endRow - req.range.startRow;
    const pageIndex = Math.floor(req.range.startRow / pageSize);
    let params: Record<string, string> = {
      page: String(pageIndex),
      pageSize: String(pageSize),
    };
    if (req.sort?.length) {
      params["sortBy"] = req.sort.map((s) => `${s.colId}:${s.direction}`).join(",");
    }
    if (req.filter) {
      // req.filter is Record<string, ColumnFilterModel> — read .conditions[0].value, NOT the model itself.
      for (const [field, model] of Object.entries(req.filter)) {
        const value = model.conditions[0]?.value;
        if (value !== undefined) params[`f_${field}`] = String(value);
      }
    }
    const data = await firstValueFrom(
      this.http.get<{ items: User[]; total: number }>("/api/users", { params }),
    );
    return { rows: data.items, totalRows: data.total };
  });

  protected readonly columns: AngularColumnDefinition[] = [/* ... */];
}
```

Initialize once as a class field (or in the constructor / `ngOnInit`) so the data source identity is stable across change detection cycles.

**Tune the page cache via the `[rowLoading]` input on `<gp-grid>`, NOT as a second arg to `createServerDataSource`.** `createServerDataSource(queryFn, options?)` only accepts `{ loadMode? }`; cache config is a grid-level concern:

```ts
protected readonly rowLoading: RowLoadingOptions = {
  cache: { eviction: "balanced", pageSize: 100, prefetchPages: 1, maxPages: 20 },
};
```

```html
<gp-grid [columns]="columns" [dataSource]="dataSource" [rowLoading]="rowLoading" [rowHeight]="36" />
```

Import `RowLoadingOptions` from `@gp-grid/angular`.

## Custom renderers — `TemplateRef`

Angular renderers are `TemplateRef`s declared in the same component template. The grid passes the renderer params as the implicit context, accessed via `let-params` or destructuring:

```ts
import {
  Component,
  ViewChild,
  AfterViewInit,
  ChangeDetectorRef,
  inject,
} from "@angular/core";
import { GpGridComponent } from "@gp-grid/angular";
import type {
  AngularColumnDefinition,
  CellRendererTemplate,
  HeaderRendererTemplate,
  EditRendererTemplate,
  EditRendererParams,
} from "@gp-grid/angular";

@Component({
  selector: "app-people-grid",
  standalone: true,
  imports: [GpGridComponent],
  template: `
    <ng-template #ageBadge let-params>
      <span [class]="ageTone(params.value)" style="padding: 2px 8px; border-radius: 12px">
        {{ params.value }}
      </span>
    </ng-template>

    <ng-template #cityHeader let-params>
      <strong>🏙 {{ params.column.headerName }}</strong>
    </ng-template>

    <ng-template #cityEditor let-params>
      <select
        autofocus
        [value]="params.initialValue"
        (change)="onCityEditChange($event, params)"
        (keydown)="onCityEditKeyDown($event, params)"
      >
        @for (city of cityOptions; track city) {
          <option [value]="city">{{ city }}</option>
        }
      </select>
    </ng-template>

    <div style="width: 100%; height: 400px">
      <gp-grid [columns]="columns" [dataSource]="grid.dataSource" [rowHeight]="36" />
    </div>
  `,
})
export class PeopleGridComponent implements AfterViewInit {
  @ViewChild("ageBadge",   { static: true }) ageBadge!: CellRendererTemplate;
  @ViewChild("cityHeader", { static: true }) cityHeader!: HeaderRendererTemplate;
  @ViewChild("cityEditor", { static: true }) cityEditor!: EditRendererTemplate;

  protected readonly cityOptions = ["New York", "London", "Paris", "Tokyo"];
  protected readonly grid = createGridData<Person>(/* ... */);

  protected columns: AngularColumnDefinition[] = [];

  private readonly cdr = inject(ChangeDetectorRef);

  ngAfterViewInit(): void {
    // Build columns AFTER ViewChild templates resolve, then run CD once.
    this.columns = [
      { field: "id",   cellDataType: "number", headerName: "ID",   width: 80 },
      { field: "name", cellDataType: "text",   headerName: "Name", width: 200, editable: true },
      {
        field: "age",
        cellDataType: "number",
        headerName: "Age",
        width: 100,
        cellRenderer: this.ageBadge,
      },
      {
        field: "city",
        cellDataType: "text",
        headerName: "City",
        width: 150,
        editable: true,
        headerRenderer: this.cityHeader,
        editRenderer: this.cityEditor,
      },
    ];
    this.cdr.detectChanges();
  }

  protected ageTone(value: number): string {
    if (value < 30) return "young";
    if (value < 50) return "mid";
    return "senior";
  }

  protected onCityEditChange(event: Event, params: EditRendererParams): void {
    const value = (event.target as HTMLSelectElement).value;
    params.onValueChange(value);
    params.onCommit();
  }

  protected onCityEditKeyDown(event: KeyboardEvent, params: EditRendererParams): void {
    event.stopPropagation(); // don't let the grid hijack arrow keys mid-edit
    if (event.key === "Escape") params.onCancel();
    else if (event.key === "Enter") params.onCommit();
  }
}
```

Important details:

- **Templates are resolved at `AfterViewInit`** with `{ static: true }`. Build the columns array there, then call `cdr.detectChanges()` to push the new columns into the grid input. Building columns in the constructor or class fields gives `undefined` template refs.
- **`let-params`** receives the full renderer params object. Use property access in the template (`params.value`, `params.rowData`, `params.column`, etc.).
- **For edit renderers**, call `event.stopPropagation()` in `keydown` so the grid's keyboard handler doesn't intercept arrow keys / Enter while the user types in the editor.
- **Column TemplateRef changes**: if you reassign `this.columns` later, run `cdr.detectChanges()` (or use signals — see below) so Angular pushes the new array into the `[columns]` input.

`AngularColumnDefinition` accepts three forms for each renderer:

- `string` — registry key (paired with `[cellRenderers]="{ key: tpl }"` input)
- `TemplateRef<{ $implicit: CellRendererParams }>` — direct reference (most common)
- `(params: CellRendererParams) => unknown` — render function

The TemplateRef form is by far the most idiomatic in Angular.

## Signals-friendly columns (alternative)

If you prefer signals over `cdr.detectChanges()`, drive `columns` from a `signal` that you set in `AfterViewInit`:

```ts
columns = signal<AngularColumnDefinition[]>([]);

ngAfterViewInit(): void {
  this.columns.set([
    { field: "id", cellDataType: "number", headerName: "ID", width: 80 },
    { field: "age", cellDataType: "number", headerName: "Age", width: 100, cellRenderer: this.ageBadge },
    /* ... */
  ]);
}
```

Template: `<gp-grid [columns]="columns()" ... />`. The `<gp-grid>` inputs are signal-based, so this composes naturally.

## Listening to changes

The component exposes `(onRowDragEnd)`, `(onCellValueChanged)`, `(onColumnResized)`, `(onColumnMoved)` outputs:

```html
<gp-grid
  [columns]="columns"
  [dataSource]="grid.dataSource"
  [rowHeight]="36"
  [getRowId]="getRowId"
  (onCellValueChanged)="onCellValueChanged($event)"
  (onRowDragEnd)="onRowDragEnd($event)"
  (onColumnResized)="onColumnResized($event)"
  (onColumnMoved)="onColumnMoved($event)"
/>
```

Output payloads:

- `onCellValueChanged: CellValueChangedEvent<TData>` — full event from core
- `onRowDragEnd: { source: number; target: number }`
- `onColumnResized: { colIndex: number; newWidth: number }`
- `onColumnMoved: { fromIndex: number; toIndex: number }`

`getRowId` is **required** when listening to `onCellValueChanged`. Pass it as `[getRowId]` (a function reference).

## Programmatic API

Get the `GridCore` via `@ViewChild`. The component holds an internal `bindings.coreRef`; for now, the public path is to read it from a wrapper / proxy you maintain, or escalate by using `ViewChild` + accessing the underlying core through the component's bindings (the long-term API for this is evolving — check `packages/angular/src/lib/gp-grid.component.ts` for current exposure).

For the common operations (sort, filter, edit), you'll usually drive them via `[columns]` / `[dataSource]` inputs and `output()` events instead of imperative calls.

## Highlighting

```ts
import type { HighlightingOptions } from "@gp-grid/angular";

protected readonly highlighting: HighlightingOptions = {
  computeRowClasses:    (ctx) => (ctx.isHovered ? ["pg-row--hover"] : []),
  computeColumnClasses: (ctx) => (ctx.isHovered ? ["pg-col--hover"] : []),
};
```

```html
<gp-grid
  [columns]="columns"
  [dataSource]="grid.dataSource"
  [rowHeight]="36"
  [highlighting]="highlighting"
/>
```

```css
/* Global stylesheet (NOT a component-scoped stylesheet) — gp-grid renders cells outside Angular's view encapsulation by default for these classes. Use ViewEncapsulation.None on the component, or move the styles to a global file. */
.pg-row--hover { background: rgba(59, 130, 246, 0.2) !important; }
.pg-col--hover { background: rgba(16, 185, 129, 0.2) !important; }
```

## All `<gp-grid>` inputs / outputs (cheatsheet)

Inputs:

| Input | Type | Default |
|---|---|---|
| `[columns]` | `AngularColumnDefinition[]` | required |
| `[rows]` | `unknown[]` | `[]` |
| `[dataSource]` | `DataSource<unknown> \| null` | `null` |
| `[getRowId]` | `((row: unknown) => RowId) \| null` | `null` |
| `[rowHeight]` | `number` | `32` |
| `[headerHeight]` | `number` | `32` |
| `[darkMode]` | `boolean` | `false` |
| `[cellRenderers]` | `Record<string, CellRendererTemplate>` | `{}` |
| `[headerRenderers]` | `Record<string, HeaderRendererTemplate>` | `{}` |
| `[editRenderers]` | `Record<string, EditRendererTemplate>` | `{}` |
| `[cellRenderer]` | `CellRendererTemplate \| null` | `null` |
| `[headerRenderer]` | `HeaderRendererTemplate \| null` | `null` |
| `[editRenderer]` | `EditRendererTemplate \| null` | `null` |
| `[highlighting]` | `HighlightingOptions \| null` | `null` |
| `[rowDragEntireRow]` | `boolean` | `false` |
| `[overscan]` | `number` | `3` |
| `[rowLoading]` | `RowLoadingOptions \| null` | `null` |
| `[sortingEnabled]` | `boolean` | `true` |
| `[wheelDampening]` | `number` | `0.1` |

Outputs:

| Output | Payload |
|---|---|
| `(onRowDragEnd)` | `{ source: number; target: number }` |
| `(onCellValueChanged)` | `CellValueChangedEvent<unknown>` |
| `(onColumnResized)` | `{ colIndex: number; newWidth: number }` |
| `(onColumnMoved)` | `{ fromIndex: number; toIndex: number }` |

## Angular-specific gotchas

- **TemplateRef columns built in constructor / class fields** → templates are `undefined`. Build columns in `ngAfterViewInit` and call `cdr.detectChanges()` (or use a signal).
- **Edit renderer doesn't capture keys** → call `event.stopPropagation()` in the `(keydown)` handler so the grid's global key handler doesn't fire while the user types.
- **Highlight CSS in component-scoped stylesheet with default encapsulation** → won't apply to grid cells. Move to a global stylesheet or set `encapsulation: ViewEncapsulation.None` on the component.
- **`provideGridData` registered at the root injector** → all `<gp-grid>` instances share one data source. Register it on each consuming component instead.
- **SSR (Angular Universal)**: the wrapper checks `isPlatformBrowser` before touching `document` and `ResizeObserver`. Just don't try to use the imperative `core` API during SSR.
- **OnPush change detection**: the component uses `ChangeDetectionStrategy.OnPush` and signals internally. Mutating an array passed to `[columns]` won't trigger CD — replace it (`this.columns = [...this.columns, newCol]`) or use a signal.

## Working playground

A complete working example (1.5M rows, signal-driven dark mode toggle, TemplateRef renderers, `provideGridData` / `injectGridData`, custom city editor, highlighting) lives at `playgrounds/angular/src/app/app.ts` (with template at `app.html`). Read it whenever you need a real end-to-end pattern.
