// packages/core/src/filtering/date-values.ts
// Date filter values: input formatting and the time span a value covers

import type { CellDataType } from "../types";

export type DateFilterInputType = "date" | "datetime-local";

/** Time range a filter value covers, end exclusive. */
export interface DateSpan {
  start: number;
  end: number;
  /** A full timestamp (Date or ISO string): equality falls back to the same day. */
  point: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MINUTE_MS = 60_000;

const pad = (value: number): string => String(value).padStart(2, "0");

const formatLocalDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatLocalMinute = (date: Date): string =>
  `${formatLocalDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The native input matching a column type: datetime columns also pick a time. */
export const getDateFilterInputType = (dataType?: CellDataType): DateFilterInputType =>
  dataType === "dateTime" || dataType === "dateTimeString" ? "datetime-local" : "date";

/** Parses `YYYY-MM-DD` as local midnight; `new Date` would read it as UTC. */
export const parseLocalDate = (value: string): Date => {
  if (!DATE_ONLY.test(value)) return new Date(value);
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
};

/** Formats a filter value for a native date or datetime-local input, in local time. */
export const formatDateFilterInput = (
  value: Date | string | undefined,
  inputType: DateFilterInputType,
): string => {
  if (value === undefined || value === "") return "";
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return inputType === "datetime-local" ? formatLocalMinute(date) : formatLocalDay(date);
};

const nextLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();

/**
 * `YYYY-MM-DD` covers the whole local day and `YYYY-MM-DDTHH:mm` the whole
 * minute, so the values the filter inputs produce match their precision.
 */
export const toDateSpan = (value: Date | string | undefined): DateSpan | null => {
  if (value === undefined) return null;
  const date = value instanceof Date ? value : parseLocalDate(value);
  const start = date.getTime();
  if (Number.isNaN(start)) return null;
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return { start, end: nextLocalDay(date), point: false };
  }
  if (typeof value === "string" && LOCAL_MINUTE.test(value)) {
    return { start, end: start + MINUTE_MS, point: false };
  }
  return { start, end: start + 1, point: true };
};
