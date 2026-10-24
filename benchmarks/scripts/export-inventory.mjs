// benchmarks/scripts/export-inventory.mjs
// Lists every export of the four built root entries, with its kind, the
// section of the source entry it comes from, and who uses it (wrapper source
// imports from "@gp-grid/core", docs, skill), so the API review's
// "Delivered surface (1.0)" tables can be checked by name.
// Usage: node scripts/export-inventory.mjs [--json] [entry ...]  (after pnpm build:candidate)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRIES = {
  core: { dts: "packages/core/dist/index.d.ts", source: "packages/core/src/index.ts" },
  react: { dts: "packages/react/dist/index.d.ts", source: "packages/react/src/index.ts" },
  vue: { dts: "packages/vue/dist/index.d.ts", source: "packages/vue/src/index.ts" },
  angular: { dts: "packages/angular/dist/angular/types/gp-grid-angular.d.ts", source: "packages/angular/src/public-api.ts" },
};
const WRAPPER_SOURCES = { react: "packages/react/src", vue: "packages/vue/src", angular: "packages/angular/src" };
const DOC_ROOTS = ["docs", "packages/core/README.md", "packages/react/README.md", "packages/vue/README.md", "packages/angular/README.md", ".claude/skills/gp-grid-integration"];

const TYPE_FLAGS = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.TypeParameter;

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "evals") walk(full, out);
    } else out.push(full);
  }
  return out;
};

/** Exported names of a built declaration file: [{ name, kind }]. */
const exportsOf = (dtsFile) => {
  const program = ts.createProgram([dtsFile], { skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(dtsFile);
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) throw new Error(`${dtsFile} is not a module`);
  return checker.getExportsOfModule(moduleSymbol).map((symbol) => {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const isType = (resolved.flags & TYPE_FLAGS) !== 0 && (resolved.flags & ts.SymbolFlags.Value) === 0;
    return { name: symbol.name, kind: isType ? "type" : "value" };
  }).sort((a, b) => a.name.localeCompare(b.name));
};

/** Name -> nearest preceding docblock or line comment in the source entry. */
const sectionsOf = (sourceFile) => {
  const map = new Map();
  let section = "";
  const text = fs.readFileSync(sourceFile, "utf8");
  for (const statement of ts.createSourceFile(sourceFile, text, ts.ScriptTarget.ES2022, true).statements) {
    const comments = ts.getLeadingCommentRanges(text, statement.getFullStart()) ?? [];
    const last = comments.at(-1);
    if (last !== undefined) {
      const raw = text.slice(last.pos, last.end).replace(/^\/\*\*?|\*\/$|^\/\/|^\s*\*/gm, " ").replace(/\s+/g, " ").trim();
      if (raw !== "" && raw.startsWith("=") === false) section = raw;
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) map.set(element.name.text, section);
    } else if (ts.canHaveModifiers(statement) && statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      const name = statement.name?.text ?? (ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((d) => d.name.getText()).join(",") : "");
      for (const part of name.split(",")) if (part !== "") map.set(part, section);
    }
  }
  return map;
};

/** Names each wrapper imports from "@gp-grid/core" in its source. */
const wrapperImports = () => {
  const byWrapper = {};
  for (const [wrapper, dir] of Object.entries(WRAPPER_SOURCES)) {
    const names = new Set();
    for (const file of walk(path.join(root, dir)).filter((f) => /\.(ts|tsx|vue)$/.test(f))) {
      const text = fs.readFileSync(file, "utf8");
      for (const match of text.matchAll(/(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@gp-grid\/core["']/g)) {
        for (const spec of match[1].split(",")) {
          const name = spec.replace(/^\s*type\s+/, "").split(/\s+as\s+/)[0].trim();
          if (name !== "") names.add(name);
        }
      }
    }
    byWrapper[wrapper] = names;
  }
  return byWrapper;
};

/** Doc files mentioning a name as a word. */
const docMentions = () => {
  const files = DOC_ROOTS.flatMap((p) => (fs.statSync(path.join(root, p)).isDirectory() ? walk(path.join(root, p)) : [path.join(root, p)])).filter((f) => f.endsWith(".md"));
  const texts = files.map((f) => [path.relative(root, f), fs.readFileSync(f, "utf8")]);
  return (name) => texts.filter(([, text]) => new RegExp(`\\b${name}\\b`).test(text)).map(([file]) => file);
};

const main = () => {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const wanted = args.filter((a) => a !== "--json");
  const entries = Object.entries(ENTRIES).filter(([name]) => wanted.length === 0 || wanted.includes(name));
  const imports = wrapperImports();
  const mentions = docMentions();
  const lists = {};
  for (const [name, entry] of entries) {
    const sections = sectionsOf(path.join(root, entry.source));
    lists[name] = exportsOf(path.join(root, entry.dts)).map((item) => ({
      ...item,
      section: sections.get(item.name) ?? "",
      wrappers: name === "core" ? Object.entries(imports).filter(([, names]) => names.has(item.name)).map(([w]) => w) : [],
      docs: mentions(item.name),
    }));
  }
  if (json) {
    console.log(JSON.stringify(lists, null, 2));
    return;
  }
  for (const [name, list] of Object.entries(lists)) {
    console.log(`\n## ${name} (${list.length} exports, ${list.filter((i) => i.kind === "value").length} values)\n`);
    console.log("| Export | Kind | Section | Used by wrappers | Doc files |\n|---|---|---|---|---|");
    for (const item of list) console.log(`| \`${item.name}\` | ${item.kind} | ${item.section} | ${item.wrappers.join(", ")} | ${item.docs.length} |`);
  }
};

main();
