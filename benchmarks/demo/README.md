# Demo recordings

Short screen recordings of the grid, one per feature, used by
[gridcast](../../.gridcast.json) to cut release videos. They run on the same
Playwright harness as the conformance suite (`../conformance`), against the
built React playground, with video on.

```sh
# from benchmarks/ (after pnpm build:candidate && pnpm --filter vite-react exec vite build)
npx playwright test --config playwright.demo.config.ts            # all demos
npx playwright test --config playwright.demo.config.ts demo/sorting # one
```

Recordings land in `results/demo/<name>/video.webm`; the JSON report in
`results/demo-report.json` carries each demo's metadata.

## Adding a demo

One file per feature, named after the **conventional-commit scope** of the
feature: `feat(fill-handle): …` → `demo/fill-handle.demo.ts`. gridcast matches
changelog entries to demos by that scope (exact scope first, then the scope's
words appearing in the entry text), so the name is the contract.

```ts
import { caption, cell, click, describeDemo, finish, openDemo, pause, test } from "./helpers";

test("my-feature", async ({ page }, testInfo) => {
  describeDemo(testInfo, {
    scope: "my-feature",
    title: "What the viewer sees",            // title card + caption
    summary: "One sentence on why it matters.",
    talkingPoints: ["bullet", "bullet", "bullet"], // for the voice-over, not a script
    keywords: ["my feature", "feature"],         // extra phrases that match changelog entries
  });
  const pageErrors = await openDemo(page, testInfo);

  await caption(page, "Do the thing");
  await click(page, cell(page, 1, 1));
  await pause(800);

  await finish(page, pageErrors);
});
```

Stage: `stage.ts` frames the grid, draws the cursor and the caption pill.
When gridcast passes `GRIDCAST_FONT` (its `video.fontFile`), the grid and the
captions use that font, so the recording matches the cards around it.

Pace: every `pause`, `hover`, `click`, `drag` and `wheel` is scaled by
`GRIDCAST_PACE` (default 1). `GRIDCAST_PACE=1.4` makes every demo 40% slower
without touching the files; gridcast sets it from `demos.pace` in its config.

Guidelines that make the clip watchable:

- 8–15 seconds of action. The viewer is scrolling a feed.
- Move the mouse like a hand (`hover`, `click`, `drag`, `wheel`), never
  `scrollTop = …` except for a deliberate jump; the fake cursor follows the mouse.
- One caption per beat, three beats max. Captions can be disabled with
  `GRIDCAST_CAPTIONS=0` if you prefer to narrate everything.
- No `expect` on grid state. The only assertion is `finish`'s check that the page
  threw no errors; a demo is not a test.
- Use the main playground page (realistic data), not `?conformance=1`.
  `pressControl(page, "Group rows")` clicks the playground's buttons even
  though they are hidden off-stage.
