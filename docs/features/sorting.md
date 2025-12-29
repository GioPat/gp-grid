# Sorting

GP-Grid provides flexible sorting capabilities with visual feedback.

## Global Sorting Toggle

Control sorting at the grid level with `sortingEnabled`:

```tsx
<Grid
  columns={columns}
  rowData={data}
  rowHeight={35}
  sortingEnabled={true}  // Default: true
/>
```

When `sortingEnabled={false}`:
- Sort arrows are hidden
- Clicking headers does not trigger sorting
- Hash computation for sorting is skipped (performance benefit)

## Per-Column Sorting

Override sorting behavior for specific columns:

```tsx
const columns = [
  { field: 'id', cellDataType: 'number', width: 80, sortable: false },
  { field: 'name', cellDataType: 'text', width: 200, sortable: true },
  { field: 'status', cellDataType: 'text', width: 100 }, // Inherits global setting
];
```

## Visual Indicators

Sortable columns display stacked sort arrows:

```
Column Header ▲
              ▼
```

- **No sort**: Both arrows dimmed
- **Ascending**: Up arrow highlighted (blue)
- **Descending**: Down arrow highlighted (blue)

## Multi-Column Sort

Hold `Shift` while clicking headers to sort by multiple columns. A sort index appears next to the arrows indicating the sort priority.

## Sort Cycling

Clicking a column header cycles through:
1. None -> Ascending
2. Ascending -> Descending
3. Descending -> None

## API

### GridProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sortingEnabled` | `boolean` | `true` | Enable/disable sorting globally |

### ColumnDefinition

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sortable` | `boolean` | Inherits from `sortingEnabled` | Column-level sort control |

### GridCore Methods

```typescript
// Set sort on a column
core.setSort(colId: string, direction: 'asc' | 'desc' | null, addToExisting?: boolean);

// Check if sorting is enabled
core.sortingEnabled; // boolean

// Check if column is sortable
core.isColumnSortable(colIndex: number): boolean;
```
