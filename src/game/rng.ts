/**
 * Deterministic pseudo-random number generator (PRNG) and shuffling utilities.
 *
 * Guaranteed deterministic cross-platform behavior: Both players in duel mode
 * and all players in daily mode are dealt byte-identical boards from a given seed.
 */

/** Default initial state for Mulberry32 (golden ratio fractional constant 2^32 / phi). */
const MULBERRY32_DEFAULT_SEED = 0x9e3779b9;

/** Increment constant added per Mulberry32 generation step. */
const MULBERRY32_INCREMENT = 0x6d2b79f5;

/** Divisor to normalize a 32-bit unsigned integer to the range [0, 1). */
const UINT32_DIVISOR = 4294967296;

/** Maximum allowable 32-bit seed value. */
const MAX_SEED_VALUE = 0xfffffffe;

/** Prime multiplier constants used in deterministic seed derivation. */
const SEED_DERIVE_PRIME_1 = 0x9e3779b1;
const SEED_DERIVE_PRIME_2 = 0x85ebca6b;

/** A pseudo-random number generator function returning values in [0, 1). */
export type RngFn = () => number;

/**
 * Creates a mulberry32 PRNG generator function.
 * Mulberry32 is lightweight, fast, has good distribution, and is ideal for tile shuffling.
 *
 * @param seed - The 32-bit integer seed. Defaults to golden ratio seed if 0 or invalid.
 * @returns A zero-argument function returning pseudo-random float in [0, 1).
 */
export function createRng(seed: number): RngFn {
  let state = (seed >>> 0) || MULBERRY32_DEFAULT_SEED;
  return function next(): number {
    state = (state + MULBERRY32_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_DIVISOR;
  };
}

/**
 * Fisher-Yates shuffle algorithm driven by a deterministic RNG.
 * Mutates and returns `list` in place.
 *
 * @param list - The array of items to shuffle.
 * @param rng - The random number generator function.
 * @returns The same array shuffled in place.
 */
export function shuffleInPlace<T>(list: T[], rng: RngFn): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

/**
 * Generates a fresh random 32-bit non-zero seed for a new game run or duel.
 *
 * @returns A positive integer seed in [1, MAX_SEED_VALUE].
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED_VALUE) + 1;
}

/**
 * Derives a related but distinctly distributed seed (e.g. used for reshuffles).
 *
 * @param seed - The parent seed.
 * @param step - The derivation step index or counter.
 * @returns A derived 32-bit unsigned integer seed.
 */
export function deriveSeed(seed: number, step: number): number {
  return (Math.imul(seed >>> 0, SEED_DERIVE_PRIME_1) + step * SEED_DERIVE_PRIME_2) >>> 0 || 1;
}
