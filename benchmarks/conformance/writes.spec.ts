// benchmarks/conformance/writes.spec.ts
// AC-013-01/02: one onWriteCommitted per write command, and a paste that
// skips a non-editable column and a type mismatch and reports each skip.
// AC-013-03/04/05: undo and redo by record id through the keys, after a sort,
// a filter and an application change, and the keys without history.
// Runs in the react, vue and angular projects.

import { expect, test } from "@playwright/test";
import { cell, openFixture } from "./helpers";
import { activateCell } from "./pinning-helpers";
import { pasteText } from "./row-groups-helpers";
import {
  AMOUNT,
  armWrites,
  canRedo,
  canUndo,
  dragFill,
  editCell,
  fieldValue,
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

test("AC-013-03 an edit undoes with Ctrl+Z and redoes with Ctrl+Y", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await editCell(page, 0, NAME, "Edited");
  await expect(cell(page, 0, NAME)).toHaveText("Edited");
  await cell(page, 0, NAME).click();

  await page.keyboard.press("Control+z");

  await expect(cell(page, 0, NAME)).toHaveText("Name 000");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "undo", changes: 1, skipped: [] });
  expect(await canUndo(page)).toBe(false);
  expect(await canRedo(page)).toBe(true);

  await page.keyboard.press("Control+y");

  await expect(cell(page, 0, NAME)).toHaveText("Edited");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "redo", changes: 1, skipped: [] });
  expect(pageErrors).toEqual([]);
});

test("AC-013-03 a 2×2 paste undoes in one step", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await activateCell(page, 0, NAME);
  await cell(page, 0, NAME).click();
  await pasteText(page, "a\t7\nc\t8");
  await expect(cell(page, 1, AMOUNT)).toHaveText("8");

  await page.keyboard.press("Control+z");

  await expect(cell(page, 0, NAME)).toHaveText("Name 000");
  await expect(cell(page, 0, AMOUNT)).toHaveText("0");
  await expect(cell(page, 1, NAME)).toHaveText("Name 001");
  await expect(cell(page, 1, AMOUNT)).toHaveText("7");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "undo", changes: 4, skipped: [] });
  expect(pageErrors).toEqual([]);
});

test("AC-013-03 a fill undoes in one step", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await activateCell(page, 0, NAME);
  await cell(page, 0, NAME).click();
  await page.keyboard.press("Shift+ArrowRight");
  await dragFill(page, 2, AMOUNT);
  await expect(cell(page, 2, NAME)).toHaveText("Name 000");

  await page.keyboard.press("Control+z");

  await expect(cell(page, 2, NAME)).toHaveText("Name 002");
  await expect(cell(page, 2, AMOUNT)).toHaveText("14");
  await expect(cell(page, 1, NAME)).toHaveText("Name 001");
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "undo", changes: 4, skipped: [] });
  expect(pageErrors).toEqual([]);
});

test("AC-013-03 after a sort the moved record is restored by id", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await editCell(page, 0, AMOUNT, "999");
  await page.getByTestId("writes-sort-name").click();
  await expect(cell(page, 0, NAME)).toHaveText("Name 199");
  await cell(page, 0, NAME).click();

  await page.keyboard.press("Control+z");

  await expect.poll(() => writesRecord(page, 1)).toMatchObject({ id: 1, amount: 0 });
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "undo", changes: 1, skipped: [] });
  expect(await fieldValue(page, 199, "amount")).toBe(0);
  await expect(cell(page, 0, NAME)).toHaveText("Name 199");
  expect(pageErrors).toEqual([]);
});

test("AC-013-03 after a filter hides the record it is still restored", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await editCell(page, 0, NAME, "Edited");
  await page.getByTestId("writes-filter-names").click();
  await expect(cell(page, 0, NAME)).toHaveText("Name 001");
  await cell(page, 0, NAME).click();

  await page.keyboard.press("Control+z");

  await expect.poll(() => writesRecord(page, 1)).toMatchObject({ id: 1, name: "Name 000" });
  await expect.poll(() => lastWrite(page)).toEqual({ operation: "undo", changes: 1, skipped: [] });
  await page.getByTestId("writes-clear-filter").click();
  await expect(cell(page, 0, NAME)).toHaveText("Name 000");
  expect(pageErrors).toEqual([]);
});

test("AC-013-04 a change the application made refuses the undo", async ({ page }, testInfo) => {
  const pageErrors = await armWrites(page, testInfo.project.name);
  await editCell(page, 0, AMOUNT, "5");
  await page.getByTestId("writes-conflict").click();
  await expect(cell(page, 0, AMOUNT)).toHaveText("999");
  await cell(page, 0, NAME).click();

  await page.keyboard.press("Control+z");

  await expect(page.getByTestId("metrics")).toContainText('"writeRejected":1');
  await expect(cell(page, 0, AMOUNT)).toHaveText("999");
  expect(await canUndo(page)).toBe(false);
  expect(await writesRecord(page, 1)).toMatchObject({ id: 1, amount: 999 });
  expect(pageErrors).toEqual([]);
});

test("AC-013-05 Ctrl+Z without history leaves the flat grid unchanged", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await editCell(page, 0, 1, "Edited row 0");
  await expect(cell(page, 0, 1)).toHaveText("Edited row 0");
  await cell(page, 0, 1).click();

  await page.keyboard.press("Control+z");

  await expect(cell(page, 0, 1)).toHaveText("Edited row 0");
  expect(pageErrors).toEqual([]);
});
