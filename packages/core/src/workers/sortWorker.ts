// sortWorker.ts - Web Worker for parallel sorting
import type { SortDirection } from "../GridEngine";

interface SortConfig {
  field: string;
  direction: SortDirection;
}

interface SortMessage {
  type: "sort";
  data: any[];
  sortConfigs: SortConfig[];
}

interface SortResponse {
  type: "sorted";
  data: any[];
}

// Get field value with dot notation support
function getFieldValue(obj: any, field: string): any {
  const parts = field.split(".");
  let value = obj;
  for (const part of parts) {
    if (value == null) return null;
    value = value[part];
  }
  return value ?? null;
}

// Compare two values
function compareValues(
  aVal: any,
  bVal: any,
  direction: SortDirection
): number {
  const aNum = aVal == null ? null : Number(aVal);
  const bNum = bVal == null ? null : Number(bVal);

  let comparison = 0;
  if (aVal == null && bVal == null) comparison = 0;
  else if (aVal == null) comparison = 1;
  else if (bVal == null) comparison = -1;
  else if (!isNaN(aNum!) && !isNaN(bNum!)) {
    comparison = aNum! - bNum!;
  } else {
    comparison = String(aVal).localeCompare(String(bVal));
  }

  return direction === "asc" ? comparison : -comparison;
}

// Sort data by multiple columns
function sortData(data: any[], sortConfigs: SortConfig[]): any[] {
  return data.sort((a, b) => {
    for (const config of sortConfigs) {
      const aVal = getFieldValue(a, config.field);
      const bVal = getFieldValue(b, config.field);
      const result = compareValues(aVal, bVal, config.direction);
      if (result !== 0) return result;
    }
    return 0;
  });
}

// Worker message handler
self.onmessage = (event: MessageEvent<SortMessage>) => {
  const { type, data, sortConfigs } = event.data;

  if (type === "sort") {
    const sorted = sortData(data, sortConfigs);
    const response: SortResponse = {
      type: "sorted",
      data: sorted,
    };
    self.postMessage(response);
  }
};
