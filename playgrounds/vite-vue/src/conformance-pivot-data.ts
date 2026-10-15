// playgrounds/vite-vue/src/conformance-pivot-data.ts
// The engine pivot arm's records (PRD 012): `country` cycles as the row-groups
// records do, so `null` and a missing country share one bucket apart from "".

export interface PivotRecord {
  id: number;
  country?: string | null;
  city: string;
  year: number;
  quarter: string;
  amount: number;
}

export const PIVOT_RECORD_COUNT = 1000;

/** Index 4 of the cycle leaves `country` out of the record. */
const COUNTRY_CYCLE: readonly (string | null)[] = ["IT", "FR", "", null];
const CYCLE_LENGTH = 5;

export const createPivotRecords = (): PivotRecord[] =>
  Array.from({ length: PIVOT_RECORD_COUNT }, (_, index) => {
    const record: PivotRecord = {
      id: index,
      city: `City ${index % 3}`,
      year: 2023 + (index % 3),
      quarter: `Q${(index % 4) + 1}`,
      amount: (index % 7) + 1,
    };
    const slot = index % CYCLE_LENGTH;
    if (slot < COUNTRY_CYCLE.length) record.country = COUNTRY_CYCLE[slot];
    return record;
  });

/** `pivot-add-key` commits this record: its year is a new pivot key. */
export const PIVOT_ADDED_RECORD: Omit<PivotRecord, "id"> = {
  country: "IT",
  city: "City 0",
  year: 2026,
  quarter: "Q1",
  amount: 5,
};
