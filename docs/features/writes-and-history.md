# Write commands and history

Every write the grid makes runs as one *write command*: an editor commit, a
paste, a fill, `cells.setValue`, an undo or a redo. The command writes the
records in place, as before, and reports once when it is done. With `history`
on, that command is also the step undo and redo take back.

## The write command

A command writes its cells one by one. Each written cell fires
`onCellValueChanged`, as it always did. When the command returns:

1. a hierarchy receives one `recordsChanged` with every record row written, so
   a measure edit refolds once and a dimension edit regroups once;
2. `onWriteCommitted` fires once with what the command did.

A command that neither changed nor skipped anything fires nothing. Like
`onCellValueChanged`, `onWriteCommitted` requires `getRowId`.

| `WriteCommittedEvent` | Meaning |
|---|---|
| `operation` | `"edit"`, `"paste"`, `"fill"`, `"setCellValue"`, `"undo"` or `"redo"` |
| `changes` | `WriteChange[]`, in write order: `rowId`, `columnId` (`colId ?? field`), `field`, `oldValue`, `newValue` |
| `skipped` | The targets the command did not write, each a `CellWriteRejectedEvent` with its `row`, `col`, `field`, `reason` and `operation` |

```ts
const grid = new GridCore({
  columns,
  dataSource,
  rowHeight: 32,
  getRowId: (row) => row.id,
  onWriteCommitted: (event) => {
    save(event.changes); // one request per paste, not one per cell
    if (event.skipped.length > 0) notify(`${event.skipped.length} cells were not pasted`);
  },
});
```

### Rejections and skips

A write the grid refuses is reported per cell through `onWriteRejected`, as
before, and listed in the command's `skipped`. A paste is best effort: it
writes what it can and lists the rest.

| `reason` | When | `onWriteRejected` | In `skipped` |
|---|---|---|---|
| `read-only-source` | Any write to a read-only source; an undo or redo on one | yes | yes |
| `not-a-record` | A paste, fill or `setValue` target on a group or total row | yes | yes |
| `type-mismatch` | An editor commit or a pasted value the column's `cellDataType` cannot hold | yes | yes |
| `not-editable` | A paste target in a column without `editable: true` | no | yes |
| `derived-view` | A row drag under a hierarchy; not a write command | yes | no event |
| `conflict`, `missing-record` | A refused history entry (below); nothing ran | yes | no event |

A non-editable column stays a disabled control: it fires no rejection of its
own, and only a paste, which targets a range, lists it as a skip. A hidden
column is not a target.

An `onCellValueChanged` callback that throws stops the command. The cells
written before it stay written, the event lists the cells recorded before the
throw, and the error reaches the caller.

## History

```ts
const grid = new GridCore({ ..., getRowId: (row) => row.id, history: { maxEntries: 100 } });
grid.history.undo(); // true when an entry was written back
```

`history` is creation-only and requires `getRowId`. `maxEntries` defaults to
100 and must be a positive integer; the oldest entry leaves when the stack is
over it. Every command that changed at least one cell is one entry: a fill of
200 cells undoes in one step. An undo or a redo is never recorded; it moves the
entry between the undo and the redo stack. A new entry clears redo.
`setDataSource` clears both stacks.

| `GridHistoryApi` | |
|---|---|
| `isEnabled()` | `false` without the option: nothing is recorded and the keys reach the browser |
| `canUndo()`, `canRedo()` | Whether a stack has an entry |
| `undo()`, `redo()` | Writes the entry back; `false` on an empty stack or a refused entry |
| `clear()` | Empties both stacks |

Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, with Meta counting as Ctrl.
The keys act while no editor is open, whether or not a step applied; an open
editor keeps them.

### Written back by record id

An undo writes each change's old value, in reverse order, and a redo each new
value, in order, to the record found by its id: through the source's
`getRecordById` when it has one, and among the resident rows otherwise. The
row may have moved under a sort, be scrolled away, be hidden by a filter or sit
under a collapsed group. The write runs as a command, so `onCellValueChanged`
fires per cell, `onWriteCommitted` once with `"undo"` or `"redo"`, and a
hierarchy refolds or regroups as for an edit. A change whose column left the
grid is still written; its `onCellValueChanged` carries `colIndex: -1`.

The view is not re-queried: a row on a sorted column keeps its place until the
next query, as after an edit. A record under a collapsed group has no view row,
so that command ends with a full `refresh()` instead.

### Refused entries

Before anything is written, every change of the entry is checked: the record
is found, and its field still holds what the entry wrote (what an undo expects
to find is the entry's `newValue`, what a redo expects is its `oldValue`).
Values compare with `Object.is`; two dates with the same time are the same
value. One failed check refuses the whole entry: nothing is written, the entry
is dropped, the other stack is untouched, and `onWriteRejected` fires once
with `reason: "missing-record"` or `"conflict"`, `operation: "undo"` or
`"redo"`, and the cell's view row and column, `-1` when it is not shown.
A read-only source refuses with `"read-only-source"`.

The application's own transactions on a mutable source are not entries. They
are what the check catches: an `updateCell` on a cell an entry wrote makes
that entry a conflict.

## Wrappers

| | React | Vue | Angular |
|---|---|---|---|
| The event | `onWriteCommitted` prop | `onWriteCommitted` prop | `(onWriteCommitted)` output |
| History | `history` prop | `history` prop | `[history]` input |
| The API | `gridRef.current?.core?.history` | the exposed `core.history` | the `core` getter's `history` |

All three are creation-only, like `autoFit`.

## Server rendering

Neither the event nor history reads a browser global: a core with `history`
builds on Node, `cells.setValue` fires the event there and `undo()` writes it
back.

## Limits

- One entry is one command; a cell cannot be undone on its own.
- No re-query after an undo or a redo.
- `createClientDataSource` finds resident records only: an undo across a
  filter needs a source with `getRecordById`, such as
  `createMutableClientDataSource`.
- Row moves, column state and expansion are not entries, nor are the
  application's transactions.
- An entry refused once is gone; the conflict will not resolve itself.
- History does not survive `setDataSource`.
