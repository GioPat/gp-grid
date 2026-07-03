#!/usr/bin/env node

// Idle pause inserted between grid runs in the `bench` sequence. Running grids
// back-to-back lets one library's thermal state and leftover GC pressure carry
// into the next, biasing whichever grid runs later; a fixed gap lets the machine
// settle so run order does not favor any library. Tune with BENCH_COOLDOWN_MS
// (set to 0 to disable). Node keeps the process alive until the timer fires,
// then exits on its own.
const ms = Number(process.env.BENCH_COOLDOWN_MS ?? 5000);

if (ms > 0) {
  console.log(`Cooldown ${ms}ms before next grid...`);
  setTimeout(() => {}, ms);
}
