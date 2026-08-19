// Map a profiled call frame (served URL + 0-based line/column) back to its
// original source through the build's .map files, using Node's built-in
// source-map support (no dependencies). Resolution is chained: Vite's map
// points at `packages/react/dist/index.js`, whose own map points at the
// wrapper's src. Falls back to the served URL when a frame can't be resolved
// (native frames, missing map, external server).

import { existsSync, readFileSync } from "node:fs";
import { SourceMap, type SourceMapPayload, type SourceOrigin } from "node:module";
import path from "node:path";
import type { CpuProfileNode } from "../capture";

export interface ResolvedFrame {
  /** Original source path when resolvable, else the served URL. */
  file: string;
  line: number | null;
  /** Original function name if the map knows it, else the profile's name. */
  name: string;
}

interface Position {
  file: string;
  line: number;
  column: number;
  name: string | undefined;
}

const MAX_CHAIN = 4;

const normalize = (file: string): string => file.replaceAll("\\", "/");

const isOrigin = (value: SourceOrigin | Record<string, never>): value is SourceOrigin =>
  typeof (value as SourceOrigin).fileName === "string";

const readSourceMap = (file: string): SourceMap | null => {
  const mapFile = `${file}.map`;
  if (existsSync(mapFile) === false) return null;
  try {
    const payload = JSON.parse(readFileSync(mapFile, "utf8")) as SourceMapPayload;
    return new SourceMap(payload);
  } catch {
    return null;
  }
};

export interface FrameResolver {
  resolve: (node: CpuProfileNode) => ResolvedFrame;
}

/**
 * @param distDir built assets root; a frame URL's pathname is looked up under it
 * @param baseUrl origin the assets were served from (other origins are left as-is)
 */
export const createFrameResolver = (
  distDir: string,
  baseUrl: string,
): FrameResolver => {
  const maps = new Map<string, SourceMap | null>();

  const mapFor = (file: string): SourceMap | null => {
    const cached = maps.get(file);
    if (cached !== undefined) return cached;
    const map = readSourceMap(file);
    maps.set(file, map);
    return map;
  };

  // One hop through `${file}.map`; positions are 1-based on both sides.
  const hop = (position: Position): Position | null => {
    const map = mapFor(position.file);
    if (map === null) return null;
    const origin = map.findOrigin(position.line, position.column);
    if (isOrigin(origin) === false) return null;
    const dir = path.dirname(position.file);
    return {
      file: path.isAbsolute(origin.fileName) ? origin.fileName : path.resolve(dir, origin.fileName),
      line: origin.lineNumber,
      column: origin.columnNumber,
      name: origin.name ?? position.name,
    };
  };

  const servedFile = (url: string): string | null => {
    if (url.startsWith(baseUrl) === false) return null;
    return path.join(distDir, new URL(url).pathname);
  };

  const resolve = (node: CpuProfileNode): ResolvedFrame => {
    const { url, functionName, lineNumber, columnNumber } = node.callFrame;
    const fallback: ResolvedFrame = {
      file: url,
      line: url.length > 0 ? lineNumber + 1 : null,
      name: functionName,
    };
    const file = servedFile(url);
    if (file === null) return fallback;

    let position: Position = { file, line: lineNumber + 1, column: columnNumber + 1, name: undefined };
    let hops = 0;
    for (; hops < MAX_CHAIN; hops++) {
      const next = hop(position);
      if (next === null) break;
      position = next;
    }
    if (hops === 0) return fallback;
    return {
      file: normalize(position.file),
      line: position.line,
      name: functionName.length > 0 ? functionName : (position.name ?? functionName),
    };
  };

  return { resolve };
};
