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
| `=` | = | Equal to |
| `!=` | ≠ | Not equal to |
| `>` | > | Greater than |
| `<` | < | Less than |
| `>=` | ≥ | Greater or equal |
| `<=` | ≤ | Less or equal |
| `between` | ↔ | Between two values |
| `blank` | Is blank | Null/undefined values |
| `notBlank` | Not blank | Non-null values |

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
  selectedValues?: Set<string>;
  includeBlank?: boolean;
}

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
