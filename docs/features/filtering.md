# Filtering

GP-Grid provides type-aware filtering with a popup-based UI.

## Per-Column Filtering

Control filtering for each column:

```tsx
const columns = [
  { field: 'id', cellDataType: 'number', width: 80, filterable: false },
  { field: 'name', cellDataType: 'text', width: 200, filterable: true },
  { field: 'price', cellDataType: 'number', width: 100 }, // filterable by default
];
```

## Filter Icon

Filterable columns display a funnel icon in the header. Click it to open the filter popup.

- **No filter**: Icon dimmed
- **Active filter**: Icon highlighted (blue)

## Filter Types

### Text Filter

For `text` and `object` column types:

- Search input to filter the list
- "Select All" / "Deselect All" buttons
- Checkbox list of distinct values from the data
- "(Blanks)" option for null/empty values

### Number Filter

For `number` column type. Operators:

| Operator | Display | Description |
|----------|---------|-------------|
| `=` | Equals | Equal to |
| `!=` | Does not equal | Not equal to |
| `>` | Greater than | Greater than |
| `<` | Less than | Less than |
| `>=` | Greater than or equal | Greater or equal |
| `<=` | Less than or equal | Less or equal |
| `between` | Between | Between two values |
| `blank` | Is blank | Null/undefined values |
| `notBlank` | Is not blank | Non-null values |

### Date Filter

For `date`, `dateString`, `dateTime`, `dateTimeString` column types. Same operators as number (except >= and <=).

## Multiple Conditions

Add multiple conditions and combine with AND/OR:

```
Condition 1: > 100
AND
Condition 2: < 500
```

## Filter Model

The filter model structure:

```typescript
interface ColumnFilterModel {
  conditions: FilterCondition[];
  combination: 'and' | 'or';
}

type FilterCondition =
  | TextFilterCondition
  | NumberFilterCondition
  | DateFilterCondition;

// Text filter
interface TextFilterCondition {
  type: 'text';
  operator: TextFilterOperator;
  selectedValues?: Set<CellValue>;
  includeBlank?: boolean;
}
```

### Values mode stores raw values

`selectedValues` holds **raw** cell values, never formatted labels. A
`valueFormatter` only affects what the filter popup displays: entries are
grouped by label, and ticking a label selects every raw value behind it.
Server-side data sources therefore receive raw values in
`request.filter` — adding a formatter never changes what is sent to the
server. When serializing a request for a server, convert the `Set` to an
array (`[...selectedValues]`); `JSON.stringify` on a `Set` produces `{}`.

Two caveats:

- When a formatter collapses many raw values into one label on a
  high-cardinality column, supply the full raw domain via
  `ColumnDefinition.distinctValues`. Values-mode filtering matches raw
  values, so raws the grid never discovered cannot be selected (the grid
  warns in the console when its distinct scan is truncated for a formatted
  column).
- Free-text condition operators (`contains`, `equals`, ...) still compare
  against the **formatted** value on client data sources — users type the
  text they see. A server backend matching the typed text against raw data
  may behave differently for formatted columns.

```typescript

// Number filter
interface NumberFilterCondition {
  type: 'number';
  operator: NumberFilterOperator;
  value?: number;
  valueTo?: number; // For 'between' operator
}

// Date filter
interface DateFilterCondition {
  type: 'date';
  operator: DateFilterOperator;
  value?: Date | string;
  valueTo?: Date | string; // For 'between' operator
}
```

## API

### ColumnDefinition

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filterable` | `boolean` | `true` | Column-level filter control |

### GridCore Methods

```typescript
// Set filter on a column
core.setFilter(colId: string, filter: ColumnFilterModel | null);

// Open filter popup
core.openFilterPopup(colIndex: number, anchorRect: DOMRect);

// Close filter popup
core.closeFilterPopup();

// Get distinct values for a column (for checkbox list)
core.getDistinctValuesForColumn(colId: string): CellValue[];

// Check if column is filterable
core.isColumnFilterable(colIndex: number): boolean;

// Check if column has active filter
core.hasActiveFilter(colId: string): boolean;
```

## Keyboard Shortcuts

- **Escape**: Close filter popup without applying

## Localization (labels)

Every user-visible string in the grid is sourced from a shared `GridLabels`
object (English defaults live in `@gp-grid/core`). Override any of them with
the `labels` prop — pass a partial object, and `operators` is deep-merged so
you can override a single operator label without touching the rest.

```tsx
<Grid
  columns={columns}
  rowData={rows}
  rowHeight={32}
  labels={{
    emptyState: 'No rows to show',
    operators: { greaterThan: 'Superiore a' },
  }}
/>
```

Vue: `:labels="{ emptyState: 'No rows to show' }"`.
Angular: `[labels]="{ emptyState: 'No rows to show' }"`.

`GridLabels` fields:

| Field | Default | Notes |
|-------|---------|-------|
| `filterTitle` | `Filter: {column}` | `{column}` → header name |
| `and` / `or` | `AND` / `OR` | Condition combination toggles |
| `valuePlaceholder` | `Value` | Filter value input placeholder |
| `betweenSeparator` | `to` | Between-operator separator |
| `addCondition` | `+ Add condition` | |
| `removeCondition` | `×` | |
| `clear` / `apply` | `Clear` / `Apply` | |
| `valuesMode` / `conditionMode` | `Values` / `Condition` | Text filter mode toggle |
| `searchPlaceholder` | `Search...` | |
| `selectAll` / `deselectAll` | `Select All` / `Deselect All` | |
| `blanks` | `(Blanks)` | |
| `tooManyValues` | `Too many unique values ({count}). Use conditions to filter.` | `{count}` → entry count |
| `emptyState` | `No data to display` | |
| `errorPrefix` | `Error: {message}` | `{message}` → error text |

`labels.operators` keys: `contains`, `notContains`, `startsWith`, `endsWith`,
`equals`, `notEquals`, `greaterThan`, `lessThan`, `greaterThanOrEqual`,
`lessThanOrEqual`, `between`, `blank`, `notBlank`.
