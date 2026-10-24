// benchmarks/conformance/writes-helpers.ts
// The writes arm (`use-writes`): its columns, the hooks the shell publishes
// and the gestures the writes spec drives.

import { expect, type Page } from "@playwright/test";
import { cell, openFixture, readHook } from "./helpers";

export const ID = 0;
export const NAME = 1;
export const AMOUNT = 2;
export const NOTE = 3;

/** One write event as the shell summarizes it: the skips are `row:col:reason`. */
export interface WriteSummary {
  operation: string;
  changes: number;
  skipped: string[];
}

export interface WritesRecord {
  id: number;
  name: string;
  amount: number;
  note: string;
}

export const armWrites = async (page: Page, framework: string): Promise<Error[]> => {
  const pageErrors = await openFixture(page, framework);
  await page.getByTestId("use-writes").click();
  await expect(cell(page, 0, NAME)).toHaveText("Name 000");
  return pageErrors;
};

export const lastWrite = (page: Page): Promise<WriteSummary | null> =>
  readHook<WriteSummary | null>(page, "lastWrite");

export const writeCommitted = (page: Page): Promise<number> => readHook<number>(page, "writeCommitted");

export const writesRecord = (page: Page, id: number): Promise<WritesRecord | null> =>
  page.evaluate((recordId) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { writesRecord?: (id: number) => WritesRecord | null };
    }).__gpConformance;
    return hooks?.writesRecord?.(recordId) ?? null;
  }, id);

/** Opens the editor on a cell, types the draft and commits it with Enter. */
export const editCell = async (page: Page, row: number, col: number, text: string): Promise<void> => {
  const target = cell(page, row, col);
  await target.dblclick();
  const input = target.locator(".gp-grid-edit-input");
  await input.fill(text);
  await input.press("Enter");
};

/** Drags the fill handle of the current selection onto the cell at `row`, `col`. */
export const dragFill = async (page: Page, row: number, col: number): Promise<void> => {
  const handle = page.locator(".gp-grid-fill-handle");
  await expect(handle).toHaveCount(1);
  const from = await handle.boundingBox();
  const to = await cell(page, row, col).boundingBox();
  if (from === null || to === null) throw new Error("Element is not measurable.");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
};

export const canUndo = (page: Page): Promise<boolean> => readHook<boolean>(page, "canUndo");

export const canRedo = (page: Page): Promise<boolean> => readHook<boolean>(page, "canRedo");

/** A raw field at a view row, through the shell's `getFieldValue` hook. */
export const fieldValue = (page: Page, row: number, field: string): Promise<unknown> =>
  page.evaluate(({ targetRow, targetField }) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { getFieldValue?: (row: number, field: string) => unknown };
    }).__gpConformance;
    return hooks?.getFieldValue?.(targetRow, targetField) ?? null;
  }, { targetRow: row, targetField: field });

export const writesQueryCount = (page: Page): Promise<number> => readHook<number>(page, "writesQueryCount");

/** The application's own transaction on the arm's source, flushed; the wrapper refreshes from its result. */
export const appTransaction = (page: Page, name: "appUpdate" | "appUpdateLast" | "appRenameFirst" | "appAdd"): Promise<void> =>
  page.evaluate(async (hookName) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: Record<string, () => Promise<void>>;
    }).__gpConformance;
    await hooks?.[hookName]?.();
  }, name);

/** Manual heights by record id through the shell's geometry hook (PRD 011 D5). */
export const setRowHeights = (page: Page, updates: { rowId: number; height: number }[]): Promise<void> =>
  page.evaluate((heights) => {
    const hooks = (globalThis as unknown as {
      __gpConformance?: { setRowHeights?: (updates: { rowId: number; height: number }[]) => void };
    }).__gpConformance;
    hooks?.setRowHeights?.(heights);
  }, updates);
