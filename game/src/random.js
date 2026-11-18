// A tiny seeded generator (mulberry32): the same seed deals the same city, the same traffic
// and the same staged screenshots, which is what makes a shot repeatable.

export function createRandom(seed) {
  let state = seed | 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one entry of `list` with the generator. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** A number between `low` and `high` (inclusive of low, exclusive of high). */
export function range(random, low, high) {
  return low + random() * (high - low);
}
