/**
 * Deterministic pseudo-random numbers.
 *
 * Both players must be handed a byte-identical board, so every random choice in
 * the game is driven by a seed rather than Math.random.
 */

/** mulberry32 — small, fast, good enough for shuffling tiles. */
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, driven by `rng`. Mutates and returns `list`. */
export function shuffleInPlace(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

/** A fresh seed for a new duel. */
export function randomSeed() {
  return Math.floor(Math.random() * 0xfffffffe) + 1;
}

/** Derive a related-but-distinct seed (used for reshuffles). */
export function deriveSeed(seed, step) {
  return (Math.imul(seed >>> 0, 0x9e3779b1) + step * 0x85ebca6b) >>> 0 || 1;
}
