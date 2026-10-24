import type { CellValue } from "../types";

export interface ClipboardCell {
  value: CellValue;
  text: string;
}

export type ClipboardMatrix = ClipboardCell[][];

export const normalizeClipboardText = (text: string): string =>
  text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

export const parseClipboardText = (text: string): ClipboardMatrix => {
  const normalized = normalizeClipboardText(text);
  const lines = normalized.split("\n");

  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }

  return lines.map((line) =>
    line.split("\t").map((cellText) => ({
      value: cellText,
      text: cellText,
    })),
  );
};
