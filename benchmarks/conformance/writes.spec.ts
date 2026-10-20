// benchmarks/conformance/writes.spec.ts
// AC-013-01/02: one onWriteCommitted per write command, and a paste that
// skips a non-editable column and a type mismatch and reports each skip.
// Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { cell } from "./helpers";
import { activateCell } from "./pinning-helpers";
import { pasteText } from "./row-groups-helpers";
import {
  AMOUNT,
  armWrites,
  dragFill,
  editCell,
  ID,
  lastWrite,
  NAME,
  writeCommitted,
  writesRecord,
} from "./writes-helpers";

test("AC-013-02 a paste over the id column skips it, writes the name and reports the skip", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await activateCell(page, 0, ID);
  await cell(page, 0, ID).click();

  await pasteText(page, "x\ty");

  await expect(cell(page, 0, NAME)).toHaveText("y");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "paste", changes: 1, skipped: [`0:${ID}:not-editable`] });
  expect(await writeCommitted(page)).toBe(1);
  await expect(page.getByTestId("metrics")).toContainText('"writeRejected":0');
  expect(await writesRecord(page, 1)).toMatchObject({ id: 1, name: "y" });
  expect(pageErrors).toEqual([]);
});

test("AC-013-02 a pasted value the type refuses is skipped and rejected", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await activateCell(page, 0, AMOUNT);
  await cell(page, 0, AMOUNT).click();

  await pasteText(page, "abc");

  await expect.poll(() => lastWrite(page)).toEqual({ operation: "paste", changes: 0, skipped: [`0:${AMOUNT}:type-mismatch`] });
  await expect(page.getByTestId("metrics")).toContainText('"writeRejected":1');
  await expect(cell(page, 0, AMOUNT)).toHaveText("0");
  expect(await writesRecord(page, 1)).toMatchObject({ id: 1, amount: 0 });
  expect(pageErrors).toEqual([]);
});

test("AC-013-01 an editor commit is one event with one change", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);

  await editCell(page, 0, NAME, "Edited");

  await expect(cell(page, 0, NAME)).toHaveText("Edited");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "edit", changes: 1, skipped: [] });
  expect(await writeCommitted(page)).toBe(1);
  await expect(page.getByTestId("metrics")).toContainText('"editEvents":1');
  expect(pageErrors).toEqual([]);
});

test("AC-013-01 a fill is one event with every filled cell", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await activateCell(page, 0, NAME);
  await cell(page, 0, NAME).click();
  await page.keyboard.press("Shift+ArrowRight");

  await dragFill(page, 2, AMOUNT);

  await expect(cell(page, 2, NAME)).toHaveText("Name 000");
  await expect(cell(page, 2, AMOUNT)).toHaveText("0");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "fill", changes: 4, skipped: [] });
  expect(await writeCommitted(page)).toBe(1);
  expect(await writesRecord(page, 3)).toMatchObject({ id: 3, name: "Name 000", amount: 0 });
  expect(pageErrors).toEqual([]);
});
