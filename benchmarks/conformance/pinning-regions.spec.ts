// benchmarks/conformance/pinning-regions.spec.ts
// Pin admission and the overlays that respect it.

import { expect, test } from "@playwright/test";
import {
  bodyScroller,
  cell,
  columnState,
  eventCounts,
  expectAligned,
  headerCell,
  layoutColumns,
  openFixture,
  readCounter,
  resetEventCounts,
  scrollBody,
  TOLERANCE,
} from "./helpers";
import {
  bodyWidth,
  clientBox,
  COLUMN_COUNT,
  columnWindow,
  expectPinCount,
  pinColumns,
  remountTo,
  resizeHost,
  startPinBox,
} from "./pinning-helpers";

test("pins admit, reject and re-admit around a zero-width center clip", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await pinColumns(page);
  await expectPinCount(page, 2, 1);
  await expectAligned(page, COLUMN_COUNT);

  const pinStyle = await page.locator(".gp-grid-pin-button.active").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      pressed: element.getAttribute("aria-pressed"),
      radius: style.borderRadius,
    };
  });
  expect(pinStyle.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(pinStyle.pressed).toBe("true");
  expect(pinStyle.radius).toBe("4px");

  const cityPin = page.getByRole("columnheader", { name: /City/ }).locator(".gp-grid-pin-button");
  await expect(cityPin).toHaveAttribute("aria-pressed", "false");
  await expect(cityPin).toHaveAccessibleName("Pin left");
  expect(await cityPin.evaluate(element => getComputedStyle(element).opacity)).toBe("0.55");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBe("start");
  await expect(cityPin).toHaveAttribute("aria-pressed", "true");
  await expect(cityPin).toHaveAccessibleName("Pin right");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBe("end");
  await expect(cityPin).toHaveAccessibleName("Unpin");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBeNull();
  await expect(cityPin).toHaveAccessibleName("Pin left");

  const separator = await page.locator('.gp-grid-pin-header[data-pin-region="end"]').evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { color: style.backgroundColor, width: style.width };
  });
  expect(separator.width).toBe("1px");
  expect(separator.color).not.toBe("rgba(0, 0, 0, 0)");

  const viewport = await clientBox(page);
  const header = await page.locator(".gp-grid-header").boundingBox();
  if (header === null) throw new Error("Header is not measurable.");
  const gutterWidth = header.x + header.width - viewport.left - viewport.width;
  if (gutterWidth > 1) {
    const gutterCoversStrip = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("gp-grid-header-gutter") ?? false,
      { x: viewport.left + viewport.width + gutterWidth / 2, y: header.y + header.height / 2 },
    );
    expect(gutterCoversStrip).toBe(true);
  }

  const fitted = await columnWindow(page);
  expect(fitted!.start).toEqual(["id", "name"]);
  expect(fitted!.end).toEqual(["code"]);
  expect(Math.abs(fitted!.regions.startWidth - 270)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(fitted!.regions.endWidth - 160)).toBeLessThanOrEqual(TOLERANCE);

  // RTL: the same pins mirror to the inline-start edge, which is physical right.
  await remountTo(page, "rtl");
  await expectPinCount(page, 2, 1);
  await expectAligned(page, COLUMN_COUNT);
  const rtlBox = await clientBox(page);
  const rtlPin = await page.locator(".gp-grid-rows-wrapper .gp-grid-pin--start").first()
    .boundingBox();
  if (rtlPin === null) throw new Error("Start pin is not measurable.");
  expect(Math.abs(rtlPin.x + rtlPin.width - (rtlBox.left + rtlBox.width)))
    .toBeLessThanOrEqual(TOLERANCE);

  // Labels name physical sides, while the core stores logical start/end.
  await expect(cityPin).toHaveAccessibleName("Pin left");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBe("end");
  await expect(cityPin).toHaveAccessibleName("Pin right");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBe("start");
  await expect(cityPin).toHaveAccessibleName("Unpin");
  await cityPin.click();
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "city")?.pinned ?? null,
  ).toBeNull();

  await remountTo(page, "ltr");
  await expectPinCount(page, 2, 1);

  // Narrow the host to exactly the first pin's width: only it fits, so the
  // center clip collapses and the rejected pins scroll as center columns.
  const scrollbar = 600 - (await bodyWidth(page));
  await resizeHost(page, 90 + scrollbar);
  await expect.poll(async () => (await columnWindow(page))?.regions.centerViewportWidth ?? -1).toBe(0);

  const narrow = await columnWindow(page);
  expect(narrow!.range.start).toBe(narrow!.range.end);
  expect(narrow!.start).toEqual(["id"]);
  expect(narrow!.end).toEqual([]);
  for (const value of Object.values(narrow!.regions)) {
    expect(Number.isFinite(value)).toBe(true);
  }
  await expect(page.locator('[data-cell-row="0"][data-cell-region="start"]')).toHaveCount(1);
  await expect(page.locator('[data-cell-row="0"][data-cell-region="center"]')).toHaveCount(0);

  // A rejected pin keeps its request and reports its effective center region.
  const rejected = await columnState(page);
  expect(rejected.find((entry) => entry.columnId === "name"))
    .toMatchObject({ pinned: "start", region: "center" });
  expect(rejected.find((entry) => entry.columnId === "code"))
    .toMatchObject({ pinned: "end", region: "center" });

  // Clearing the pins restores the scrolling center.
  await page.getByTestId("unpin-all").click();
  await expect.poll(async () => (await columnWindow(page))?.range.end ?? 0)
    .toBeGreaterThan(0);
  await expect.poll(() => page.locator('[data-cell-row="0"][data-cell-region="center"]').count())
    .toBeGreaterThan(0);

  // Widening admits both start pins and the end pin again.
  await pinColumns(page);
  await resizeHost(page, 600);
  await expectPinCount(page, 2, 1);
  await expect.poll(async () => (await columnWindow(page))?.start.join(",") ?? "").toBe("id,name");
  await expect.poll(async () => (await columnWindow(page))?.end.join(",") ?? "").toBe("code");
  expect(pageErrors).toEqual([]);
});

test("a horizontal-only scroll reads no source rows, and an open editor survives the window", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);

  // Columnar smoke: moving the window sideways touches no new source row. The
  // formatter proves the columnar source is live before the counter is read.
  await page.getByTestId("use-columnar").click();
  await expect(cell(page, 0, 3)).toContainText("0 pts");
  const rowsTouched = await readCounter(page, "sourceDistinctRows");
  expect(rowsTouched).toBeGreaterThan(0);
  await scrollBody(page, 0, 400);
  await expect.poll(async () => (await columnWindow(page))?.range.start ?? 0).toBeGreaterThan(0);
  expect(await readCounter(page, "sourceDistinctRows")).toBe(rowsTouched);
  expect(await readCounter(page, "recordMaterializations")).toBe(0);

  // A writable source is required for the editor, so leave columnar mode.
  await page.getByTestId("use-object").click();
  await expect(cell(page, 0, 1)).toContainText("Row 000");

  // Narrow the host so a far scroll takes the edited column out of the range.
  await resizeHost(page, 240);
  await scrollBody(page, 0, 0);
  await expect.poll(async () => (await columnWindow(page))?.range.end ?? 0)
    .toBeLessThan(COLUMN_COUNT);

  await cell(page, 0, 1).dblclick();
  const input = page.locator(".gp-grid-edit-input");
  await expect(input).toHaveCount(1);
  await input.fill("draft");

  await scrollBody(page, 0, 900);
  await expect.poll(async () => (await columnWindow(page))?.range.start ?? 0).toBeGreaterThan(0);
  const scrolled = await columnWindow(page);
  // The edit column is retained outside the presented range (B7).
  expect(scrolled!.center).toContain("name");
  expect(scrolled!.range.start).toBeGreaterThan(0);

  await expect(input).toHaveCount(1);
  await expect(input).toHaveValue("draft");
  expect(await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.classList.contains("gp-grid-edit-input") ?? false,
  )).toBe(true);

  // Scrolling back re-enters the range; the draft still commits.
  await scrollBody(page, 0, 0);
  await input.press("Enter");
  await expect(page.locator(".gp-grid-edit-input")).toHaveCount(0);
  await expect(cell(page, 0, 1)).toHaveText("draft");
  expect(pageErrors).toEqual([]);
});

test("an editor keeps its draft when pin admission moves it between regions", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await pinColumns(page);
  await expectPinCount(page, 2, 1);

  await cell(page, 0, 1).dblclick();
  const input = page.locator(".gp-grid-edit-input");
  await input.fill("draft");

  const scrollbar = 600 - (await bodyWidth(page));
  await resizeHost(page, 90 + scrollbar);
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "name")?.region,
  ).toBe("center");
  await expect(input).toHaveValue("draft");

  await resizeHost(page, 600);
  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === "name")?.region,
  ).toBe("start");
  await expect(input).toHaveValue("draft");
  await input.press("Enter");
  await expect(cell(page, 0, 1)).toHaveText("draft");
  expect(pageErrors).toEqual([]);
});

test("overlays stay inside the pinned regions and a header drag pins a column", async ({ page }, testInfo) => {
  const pageErrors = await openFixture(page, testInfo.project.name);
  await pinColumns(page);
  await expectPinCount(page, 2, 1);

  await cell(page, 0, 2).click();
  const activeCell = page.locator(".gp-grid-cell--active");
  await expect(activeCell).toHaveCount(1);
  await scrollBody(page, 0, 120);
  const activeBox = await activeCell.boundingBox();
  const activePin = await startPinBox(page);
  if (activeBox === null) throw new Error("Active cell is not measurable.");
  expect(activeBox.x).toBeLessThan(activePin.x + activePin.width);
  expect(activeBox.x + activeBox.width).toBeGreaterThan(activePin.x + activePin.width);
  const regionAboveActive = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-cell-region]")?.dataset.cellRegion,
    { x: activePin.x + activePin.width - 4, y: activeBox.y + activeBox.height / 2 },
  );
  expect(regionAboveActive).toBe("start");
  await scrollBody(page, 0, 0);

  // The fill handle of a pinned editable column renders in the pin's sticky
  // overlay, never over the scrolling center.
  await cell(page, 0, 1).click();
  const overlayHandle = page.locator(".gp-grid-pin-overlay--start .gp-grid-fill-handle");
  await expect(overlayHandle).toHaveCount(1);
  await expect(page.locator(".gp-grid-rows-wrapper > .gp-grid-fill-handle")).toHaveCount(0);
  const pin = await startPinBox(page);
  const handle = await overlayHandle.boundingBox();
  if (handle === null) throw new Error("Fill handle is not measurable.");
  expect(handle.x).toBeGreaterThanOrEqual(pin.x - TOLERANCE);
  expect(handle.x + handle.width).toBeLessThanOrEqual(pin.x + pin.width + TOLERANCE);

  // A resize line stays inside the pin region it belongs to.
  const idHandle = page.locator('.gp-grid-pin-header[data-pin-region="start"] .gp-grid-header-cell')
    .first().locator(".gp-grid-header-resize-handle");
  const idBox = await idHandle.boundingBox();
  if (idBox === null) throw new Error("Resize handle is not measurable.");
  const idRow = idBox.y + idBox.height / 2;
  await page.mouse.move(idBox.x + idBox.width / 2, idRow);
  await page.mouse.down();
  await page.mouse.move(idBox.x + idBox.width / 2 + 40, idRow, { steps: 4 });
  const line = await page.locator(".gp-grid-column-resize-line").boundingBox();
  if (line === null) throw new Error("Resize line is not measurable.");
  expect(line.x).toBeLessThanOrEqual((await startPinBox(page)).x + (await startPinBox(page)).width + TOLERANCE);
  await page.mouse.up();

  // A peek preserves the cell's layout while its covered portion is clipped.
  await scrollBody(page, 0, 120);
  const clipStart = (await startPinBox(page)).x + (await startPinBox(page)).width;
  const straddling = await page.locator('[data-cell-region="center"][data-cell-row="0"]')
    .evaluateAll((elements, clipX) => {
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        if (rect.left < clipX - 8 && rect.left + rect.width > clipX + 8) {
          return { left: rect.left, width: rect.width };
        }
      }
      return null;
    }, clipStart);
  if (straddling === null) throw new Error("No center cell straddles the pin boundary.");
  const peekRow = await cell(page, 0, 0).boundingBox();
  if (peekRow === null) throw new Error("Row is not measurable.");
  await page.mouse.dblclick(clipStart + 10, peekRow.y + peekRow.height / 2);
  const peekLocator = page.locator(".gp-grid-cell-peek");
  await expect(peekLocator).toBeVisible();
  const peek = await peekLocator.boundingBox();
  if (peek === null) throw new Error("Peek is not measurable.");
  expect(Math.abs(peek.width - straddling.width)).toBeLessThanOrEqual(TOLERANCE);
  const visibleAt = async (x: number): Promise<boolean> => page.evaluate(
    ({ pointX, pointY }) =>
      document.elementFromPoint(pointX, pointY)?.closest(".gp-grid-cell-peek") !== null,
    { pointX: x, pointY: peek.y + Math.min(8, peek.height / 2) },
  );
  expect(await visibleAt(clipStart - 4)).toBe(false);
  expect(await visibleAt(clipStart + 4)).toBe(true);

  // Any cell interaction drops the peek before the header drag.
  await cell(page, 1, 2).click();
  await expect(peekLocator).toHaveCount(0);

  // The drop indicator is a viewport x: it marks the target column's inline
  // edge, and a drop on the pin region adopts the pin.
  await scrollBody(page, 0, 200);
  const boundary = (await startPinBox(page)).x + (await startPinBox(page)).width;
  const indicatorX = async (): Promise<number> => {
    const box = await page.locator(".gp-grid-column-drop-indicator").boundingBox();
    if (box === null) throw new Error("Drop indicator is not measurable.");
    return Math.round(box.x);
  };

  // A pin covers most of a scrolled center strip, so the drag source is the
  // header actually under the pointer just past the start pin.
  const headerRow = (await page.locator(".gp-grid-header").boundingBox())!.y + 18;
  const sourceX = boundary + 10;
  const source = await page.evaluate(
    ({ x, y }) => {
      const cell = (document.elementFromPoint(x, y) as HTMLElement | null)
        ?.closest(".gp-grid-header-cell");
      return cell === null
        ? null
        : { col: Number(cell.getAttribute("data-col-index")), region: cell.getAttribute("data-cell-region") };
    },
    { x: sourceX, y: headerRow },
  );
  if (source === null || source.region !== "center") {
    throw new Error("No center header under the pointer.");
  }
  const dragged = (await layoutColumns(page))[source.col]!.columnId;

  await resetEventCounts(page);
  await page.mouse.move(sourceX, headerRow);
  await page.mouse.down();
  // Straight down: the threshold is crossed without leaving the column, and the
  // indicator marks that column's scrolled inline edge.
  await page.mouse.move(sourceX, headerRow + 12, { steps: 2 });
  const draggedBox = await headerCell(page, source.col).boundingBox();
  if (draggedBox === null) throw new Error("Center header is not measurable.");
  await expect.poll(indicatorX).toBe(Math.round(draggedBox.x));

  // Over the start pin it sits at the pin's viewport edge instead, and
  // releasing there pins the dragged column.
  const pinned = await startPinBox(page);
  const pinHeader = await page.locator('.gp-grid-pin-header[data-pin-region="start"] .gp-grid-header-cell')
    .first().boundingBox();
  if (pinHeader === null) throw new Error("Pin header is not measurable.");
  await page.mouse.move(pinned.x + 20, headerRow + 12, { steps: 4 });
  await expect.poll(indicatorX).toBe(Math.round(pinHeader.x));
  await page.mouse.up();

  await expect.poll(async () =>
    (await columnState(page)).find((entry) => entry.columnId === dragged)?.pinned ?? null,
  ).toBe("start");
  await expectPinCount(page, 3, 1);
  expect((await eventCounts(page)).pinned).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
