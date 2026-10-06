// PRD 008 D12: core reaches the grouping engine only through `RowGrouping`;
// `src/index.ts` is the one module outside `row-grouping/` that imports it.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "../src");
const ENGINE = join(SRC, "row-grouping");
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const importsEngine = (file: string): boolean =>
  [...readFileSync(file, "utf8").matchAll(SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => resolve(dirname(file), specifier))
    .some((target) => target === ENGINE || target.startsWith(ENGINE + sep));

describe("row grouping module boundary (D12)", () => {
  it("is imported only by src/index.ts outside row-grouping/", () => {
    const outside = sourceFiles(SRC).filter((file) => file.startsWith(ENGINE + sep) === false);
    const importers = outside.filter(importsEngine).map((file) => relative(SRC, file));
    expect(importers).toEqual(["index.ts"]);
  });
});
