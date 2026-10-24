// happy-dom lays nothing out, so every element measures 0 × 0 and a measured
// zero-height viewport renders no rows. Give the grid a real viewport.
const VIEWPORT = { clientWidth: 800, clientHeight: 600 } as const;

for (const [property, value] of Object.entries(VIEWPORT)) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    get: () => value,
  });
}
