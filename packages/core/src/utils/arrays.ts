// packages/core/src/utils/arrays.ts

/** Same length and the same items at every position, compared with `===`. */
export const isSameArray = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);
