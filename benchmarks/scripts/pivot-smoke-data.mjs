// benchmarks/scripts/pivot-smoke-data.mjs
//
// Workloads of the pivot smoke: 1,000,000 object rows over region x city (50 x 20)
// and year x quarter (5 x 4), each city holding 50 rows at every leaf tuple.

export const ROW_COUNT = 1000000;
export const REGION_COUNT = 50;
export const CITIES_PER_REGION = 20;
export const YEARS = [2020, 2021, 2022, 2023, 2024];
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
// Four quarters without rows double the leaf tuples and leave half of them empty.
export const SPARSE_QUARTERS = [...QUARTERS, "Q5", "Q6", "Q7", "Q8"];

const CITY_COUNT = REGION_COUNT * CITIES_PER_REGION;
const TUPLE_COUNT = YEARS.length * QUARTERS.length;
const pad = (value) => String(value).padStart(2, "0");

export const MEASURES = [
  { field: "amount", aggregate: "sum" },
  { field: "count", source: "id", aggregate: "count" },
];

export const makeRows = () => {
  const regions = Array.from({ length: REGION_COUNT }, (_, region) => `r${pad(region)}`);
  const cities = Array.from({ length: CITY_COUNT }, (_, city) => {
    const region = Math.floor(city / CITIES_PER_REGION);
    return `${regions[region]}-c${pad(city % CITIES_PER_REGION)}`;
  });
  const rows = new Array(ROW_COUNT);
  for (let id = 0; id < ROW_COUNT; id += 1) {
    const city = id % CITY_COUNT;
    const tuple = Math.floor(id / CITY_COUNT) % TUPLE_COUNT;
    rows[id] = {
      id,
      region: regions[Math.floor(city / CITIES_PER_REGION)],
      city: cities[city],
      year: YEARS[Math.floor(tuple / QUARTERS.length)],
      quarter: QUARTERS[tuple % QUARTERS.length],
      amount: (id * 7919) % 1000,
    };
  }
  return { rows, cityCount: CITY_COUNT };
};

export const WORKLOADS = [
  {
    name: "dense",
    description: "every leaf tuple has rows in every city",
    domain: undefined,
    tupleCount: YEARS.length * QUARTERS.length,
  },
  {
    name: "sparse",
    description: "the same rows under a quarter domain of 8 keys: half of the 40 leaf tuples have no rows",
    domain: { quarter: SPARSE_QUARTERS },
    tupleCount: YEARS.length * SPARSE_QUARTERS.length,
  },
];

export const configOf = (workload) => ({
  rows: [{ field: "region" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: MEASURES,
  rowTotals: true,
  grandTotal: "top",
  ...(workload.domain && { domain: workload.domain }),
});
