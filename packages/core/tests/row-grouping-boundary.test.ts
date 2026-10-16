// PRD 008 D12, PRD 009 D7: `src/index.ts` is the one module outside a grouping
// engine's folder that imports it; `hierarchy/` is shared and free. PRD 012 D8 adds `pivot/`.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SRC = resolve(__dirname, "../src");
const ENGINES = ["row-grouping", "server-grouping", "pivot"];
const PRESENT = ENGINES.filter((name) => existsSync(join(SRC, name)));
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

const sourceFiles = (dir: string): string[] => {
  if (existsSync(dir) === false) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
};

const importsFolder = (file: string, folder: string): boolean =>
  [...readFileSync(file, "utf8").matchAll(SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => resolve(dirname(file), specifier))
    .some((target) => target === folder || target.startsWith(folder + sep));

describe("grouping engine module boundary (D12, D7)", () => {
  it.each(ENGINES)("%s/ is imported only by src/index.ts", (name) => {
    const engine = join(SRC, name);
    const importers = sourceFiles(SRC)
      .filter((file) => file.startsWith(engine + sep) === false)
      .filter((file) => importsFolder(file, engine))
      .map((file) => relative(SRC, file));
    expect(importers.filter((file) => file !== "index.ts")).toEqual([]);
  });

  it.each(PRESENT)("finds src/index.ts importing %s/", (name) => {
    expect(importsFolder(join(SRC, "index.ts"), join(SRC, name))).toBe(true);
  });

  it("server-grouping/ never imports row-grouping/", () => {
    const files = sourceFiles(join(SRC, "server-grouping"));
    const importers = files.filter((file) => importsFolder(file, join(SRC, "row-grouping")));
    expect(files.length).toBeGreaterThan(0);
    expect(importers.map((file) => relative(SRC, file))).toEqual([]);
  });

  it("pivot/ imports neither row-grouping/ nor server-grouping/", () => {
    const importers = sourceFiles(join(SRC, "pivot")).filter((file) =>
      ["row-grouping", "server-grouping"].some((name) => importsFolder(file, join(SRC, name))),
    );
    expect(importers.map((file) => relative(SRC, file))).toEqual([]);
  });

  it("hierarchy/ imports none of the engine folders", () => {
    const files = sourceFiles(join(SRC, "hierarchy"));
    const importers = files.filter((file) => ENGINES.some((name) => importsFolder(file, join(SRC, name))));
    expect(files.length).toBeGreaterThan(0);
    expect(importers.map((file) => relative(SRC, file))).toEqual([]);
  });
});
