// A small sales dataset for the pivot engine tests, with hand-checked figures in each test.

import type { CellValue } from "../src/types";

export interface Sale {
  [field: string]: CellValue;
  region: string;
  city: string;
  year: number;
  quarter: string;
  amount: number;
}

const sale = (region: string, city: string, year: number, quarter: string, amount: number): Sale => ({
  region,
  city,
  year,
  quarter,
  amount,
});

/** Leaf tuples over `year > quarter`: 2024/Q1, 2024/Q2, 2025/Q1. */
export const SALES: Sale[] = [
  sale("North", "Oslo", 2024, "Q1", 10),
  sale("North", "Oslo", 2024, "Q2", 20),
  sale("North", "Bergen", 2024, "Q1", 5),
  sale("North", "Bergen", 2025, "Q1", 7),
  sale("South", "Rome", 2024, "Q2", 3),
  sale("South", "Rome", 2025, "Q1", 4),
  sale("South", "Rome", 2025, "Q1", 6),
];

export const SALE_FIELDS = ["region", "city", "year", "quarter", "amount"];
