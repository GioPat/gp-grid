// packages/core/src/data-source/filtering.ts
// Re-exports from shared filtering module for backwards compatibility

export {
  isSameDay,
  evaluateTextCondition,
  evaluateNumberCondition,
  evaluateDateCondition,
  evaluateCondition,
  evaluateColumnFilter,
  applyFilters,
} from "../filtering";
