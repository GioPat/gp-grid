// packages/core/tests/index.test.ts

import { describe, it, expect } from "vitest";
import * as publicApi from "../src/index";

const expectedExports = [
  // Core
  "GridCore",
  // Managers
  "SelectionManager",
  "FillManager",
  "SlotPoolManager",
  "EditManager",
  "InputHandler",
  "HighlightManager",
  "SortFilterManager",
  "RowMutationManager",
  "ScrollVirtualizationManager",
  "TransactionManager",
  // Data sources
  "createClientDataSource",
  "createServerDataSource",
  "createDataSourceFromArray",
  "createMutableClientDataSource",
  // Transaction system
  "IndexedDataStore",
  // Sorting utilities
  "stringToSortableNumber",
  "compareValues",
  "computeValueHash",
  // Filtering utilities
  "evaluateTextCondition",
  "evaluateNumberCondition",
  "evaluateDateCondition",
  "evaluateColumnFilter",
  "rowPassesFilter",
  "isSameDay",
  // Field helpers
  "getFieldValue",
  "setFieldValue",
  // Parallel sorting
  "ParallelSortManager",
  "WorkerPool",
  "kWayMerge",
  "kWayMergeMultiColumn",
  "detectBoundaryCollisions",
  // Styles
  "gridStyles",
  "variablesStyles",
  "containerStyles",
  "headerStyles",
  "cellStyles",
  "statesStyles",
  "scrollbarStyles",
  "filtersStyles",
  "rowDragStyles",
  // Positioning utilities
  "calculateColumnPositions",
  "calculateScaledColumnPositions",
  "getTotalWidth",
  "findColumnAtX",
  // Class name utilities
  "isCellSelected",
  "isCellActive",
  "isRowVisible",
  "isCellEditing",
  "isCellInFillPreview",
  "buildCellClasses",
  "isRowInSelectionRange",
  "isColumnInSelectionRange",
  // UI State
  "createInitialState",
  // State reducer
  "applyInstruction",
  // Scroll helpers
  "findSlotForRow",
  "scrollCellIntoView",
  // Format helpers
  "formatCellValue",
  // Fill handle helpers
  "calculateFillHandlePosition",
  // Popup positioning
  "calculateFilterPopupPosition",
  // Adapter kit
  "toPointerEventData",
  "AutoScrollDriver",
  "PendingRowDragController",
  "applyBatchInstructions",
  "DataSourceOwner",
  "InputEventAdapter",
] as const;

describe("public entry point", () => {
  it.each(expectedExports)("exports %s", (name) => {
    expect(publicApi).toHaveProperty(name);
    expect(publicApi[name as keyof typeof publicApi]).toBeDefined();
  });

  it("exposes createInitialState returning a fresh default state", () => {
    const a = publicApi.createInitialState();
    const b = publicApi.createInitialState();
    expect(a).not.toBe(b);
    expect(a.slots).toBeInstanceOf(Map);
    expect(a.slots.size).toBe(0);
    expect(a.headers).toBeInstanceOf(Map);
    expect(a.headers.size).toBe(0);
    expect(a.activeCell).toBeNull();
    expect(a.selectionRange).toBeNull();
    expect(a.editingCell).toBeNull();
    expect(a.filterPopup).toBeNull();
    expect(a.isLoading).toBe(false);
    expect(a.error).toBeNull();
    expect(a.totalRows).toBe(0);
    expect(a.visibleRowRange).toBeNull();
    expect(a.hoverPosition).toBeNull();
    expect(a.columns).toBeNull();
    expect(a.pendingScrollTop).toBeNull();
    expect(a.contentWidth).toBe(0);
    expect(a.contentHeight).toBe(0);
    expect(a.viewportWidth).toBe(0);
    expect(a.viewportHeight).toBe(0);
    expect(a.rowsWrapperOffset).toBe(0);
  });

  it("honours initialWidth / initialHeight when creating state", () => {
    const state = publicApi.createInitialState({
      initialWidth: 1024,
      initialHeight: 768,
    });
    expect(state.viewportWidth).toBe(1024);
    expect(state.viewportHeight).toBe(768);
    expect(state.contentHeight).toBe(768);
    expect(state.contentWidth).toBe(0);
  });

  it("wires applyInstruction so the re-export matches direct import behaviour", () => {
    const slots = new Map();
    const headers = new Map();
    const result = publicApi.applyInstruction(
      { type: "SET_ACTIVE_CELL", position: { row: 0, col: 0 } },
      slots,
      headers,
    );
    expect(result).toEqual({ activeCell: { row: 0, col: 0 } });
  });
});
