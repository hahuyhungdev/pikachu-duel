/**
 * The Adventure ladder — deterministic progression and stage generation.
 *
 * Each stage configuration is an immutable, pure function of its stage number:
 * board dimensions, gravity patterns, special hazards (bomb, ice, gold, chrono),
 * allotted clock, and star scoring thresholds are calculated deterministically.
 */

import { COMPACT_ICON_LIMIT, MAX_ICONS } from './icons.ts';
import type { GravityMode } from './gravity.ts';
import { GRAVITY_LABELS, GRAVITY_MODES } from './gravity.ts';

/** Starting stage index for Adventure mode. */
export const FIRST_STAGE = 1;

/** Stage index where each mechanic or special hazard is introduced. */
export const INTRODUCES = {
  gravity: 4,
  gold: 3,
  chrono: 5,
  ice: 6,
  bomb: 9,
} as const;

/** Canonical board grid shapes on the progression ladder. */
const SHAPES: readonly { readonly rows: number; readonly cols: number }[] = [
  { rows: 6, cols: 8 },   // Step 0: 24 pairs (48 cells) - Stages 1-3
  { rows: 6, cols: 10 },  // Step 1: 30 pairs (60 cells) - Stages 4-7
  { rows: 8, cols: 10 },  // Step 2: 40 pairs (80 cells) - Stages 8-13
  { rows: 8, cols: 12 },  // Step 3: 48 pairs (96 cells) - Stages 14-21
  { rows: 8, cols: 14 },  // Step 4: 56 pairs (112 cells) - Stages 22-35
  { rows: 9, cols: 16 },  // Step 5: 72 pairs (144 cells) - Stages 36-55
  { rows: 10, cols: 16 }, // Step 6: 80 pairs (160 cells) - Stages 56-75
  { rows: 12, cols: 16 }, // Step 7: 96 pairs (192 cells) - Stages 76-100+
] as const;

/** Stage index thresholds where board dimensions expand. */
const STAGE_SHAPE_THRESHOLDS: readonly number[] = [1, 4, 8, 14, 22, 36, 56, 76] as const;

/** Gravity variants in rotational order on the ladder. */
const GRAVITY_ROTATION: readonly GravityMode[] = GRAVITY_MODES.filter(
  (mode): mode is Exclude<GravityMode, 'none'> => mode !== 'none'
);

/** Progression formula constants - balanced for exciting, tight adventure gameplay up to stage 100 */
const BASE_SECONDS_PER_PAIR = 3.6;
const STAGE_SECONDS_DECREMENT = 0.022;
const MIN_SECONDS_PER_PAIR = 1.9;
const MAX_STAGE_CLOCK = 180; // 3.0 minutes maximum cap to prevent fatigue

const SILVER_MULTIPLIER_PER_PAIR = 130;
const GOLD_MULTIPLIER_PER_PAIR = 190;
const GOLD_BONUS_PER_STAGE = 40;

const MIN_STAGE_ICONS = 16;
const BASE_STAGE_ICONS = 18;

const BASE_STAGE_BOMB_FUSE = 12;
const MIN_STAGE_BOMB_FUSE = 5;

/** Star scoring requirements for a stage. */
export interface StageStarThresholds {
  silver: number;
  gold: number;
}

/** Complete configuration recipe for an Adventure stage. */
export interface StageConfig {
  stage: number;
  rows: number;
  cols: number;
  pairs: number;
  iconCount: number;
  iconPool: readonly number[];
  clock: number;
  hints: number;
  shuffles: number;
  gravity: GravityMode;
  gold: number;
  chrono: number;
  ice: number;
  bomb: number;
  bombFuse: number;
  stars: StageStarThresholds;
}

/**
 * Deterministically selects a diverse palette of `count` Pokémon icons for a given stage,
 * ensuring high species variety right from early stages rather than only the first N icons.
 */
export function stageIconPool(stage: number, count: number): number[] {
  if (count >= MAX_ICONS) {
    return Array.from({ length: MAX_ICONS }, (_, i) => i + 1);
  }

  const allIcons = Array.from({ length: MAX_ICONS }, (_, i) => i + 1);

  // Deterministic 32-bit PRNG state seeded from stage index
  let state = (Math.imul(stage, 0x9e3779b9) ^ 0x85ebca6b) >>> 0;
  const nextRng = (): number => {
    state = (Math.imul(state ^ (state >>> 16), 0x45d9f3b)) >>> 0;
    state = (Math.imul(state ^ (state >>> 15), 0x45d9f3b)) >>> 0;
    state = (state ^ (state >>> 16)) >>> 0;
    return (state & 0x7fffffff) / 0x7fffffff;
  };

  // Fisher-Yates shuffle
  for (let i = allIcons.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRng() * (i + 1));
    const tmp = allIcons[i];
    allIcons[i] = allIcons[j];
    allIcons[j] = tmp;
  }

  // Ensure Pikachu (icon 1) is always featured as the game's flagship mascot
  const pikaIdx = allIcons.indexOf(1);
  if (pikaIdx >= count) {
    const swapTarget = Math.floor(nextRng() * count);
    allIcons[pikaIdx] = allIcons[swapTarget];
    allIcons[swapTarget] = 1;
  }

  return allIcons.slice(0, count).sort((a, b) => a - b);
}

/** Objective description presented to players in the HUD. */
export interface StageObjective {
  target: number;
  text: string;
  pairs: number;
}

/** Optional parameters when resolving stage configuration. */
export interface StageConfigOptions {
  portrait?: boolean;
}

/** Options for calculating earned stars upon stage completion. */
export interface StageStarsOptions {
  cleared?: boolean;
  score?: number;
}

/**
 * Normalizes and clamps the stage number to valid positive bounds.
 */
function clampStage(stage: unknown): number {
  const n = Math.trunc(Number(stage));
  return Number.isFinite(n) && n > FIRST_STAGE ? n : FIRST_STAGE;
}

/**
 * Selects the board dimension for the specified stage number,
 * swapping rows/cols if portrait is enabled.
 */
function shapeFor(stage: number, { portrait = false }: StageConfigOptions = {}): { rows: number; cols: number } {
  let step = 0;
  for (let i = STAGE_SHAPE_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (stage >= STAGE_SHAPE_THRESHOLDS[i]) {
      step = i;
      break;
    }
  }
  const base = SHAPES[step];
  if (portrait && base.cols > base.rows) {
    return { rows: base.cols, cols: base.rows };
  }
  return { rows: base.rows, cols: base.cols };
}

/**
 * Calculates allotted seconds per matched pair.
 */
function secondsPerPair(stage: number): number {
  const eased = BASE_SECONDS_PER_PAIR - (stage - FIRST_STAGE) * STAGE_SECONDS_DECREMENT;
  return Math.max(MIN_SECONDS_PER_PAIR, eased);
}

/**
 * Computes scaling hazard count starting from a given introduction stage.
 */
function countFor(stage: number, from: number, per: number, cap: number): number {
  if (stage < from) return 0;
  return Math.min(cap, 1 + Math.floor((stage - from) / per));
}

/**
 * Produces the complete stage recipe for a given stage number.
 *
 * @param stage - The 1-based stage number.
 * @param options - Viewport options (portrait orientation).
 * @returns Deterministic `StageConfig`.
 */
export function stageConfig(stage: number, { portrait = false }: StageConfigOptions = {}): StageConfig {
  const n = clampStage(stage);
  const { rows, cols } = shapeFor(n, { portrait });
  const pairs = (rows * cols) / 2;

  const gravity: GravityMode =
    n < INTRODUCES.gravity
      ? 'none'
      : GRAVITY_ROTATION[Math.floor((n - INTRODUCES.gravity) / 2) % GRAVITY_ROTATION.length];

  const gold = countFor(n, INTRODUCES.gold, 4, 5);
  const chrono = countFor(n, INTRODUCES.chrono, 6, 3);
  const ice = countFor(n, INTRODUCES.ice, 3, 8);
  const bomb = countFor(n, INTRODUCES.bomb, 4, 5);

  // Aids scale gracefully: 3 aids in early learning stages, transitioning to 2 aids at stage 14, and 1 aid at stage 27
  const hints = Math.max(1, 3 - Math.floor((n - FIRST_STAGE) / 13));
  const shuffles = Math.max(1, 3 - Math.floor((n - FIRST_STAGE) / 13));

  const silver = Math.round(pairs * SILVER_MULTIPLIER_PER_PAIR);
  const goldScore = Math.round(pairs * GOLD_MULTIPLIER_PER_PAIR + n * GOLD_BONUS_PER_STAGE);

  const fullIconCount = Math.min(
    MAX_ICONS,
    Math.max(MIN_STAGE_ICONS, Math.min(pairs, BASE_STAGE_ICONS + Math.floor((n - 1) * 1.5)))
  );
  const iconCount = portrait ? Math.min(fullIconCount, COMPACT_ICON_LIMIT) : fullIconCount;
  const iconPool = stageIconPool(n, iconCount);

  return {
    stage: n,
    rows,
    cols,
    pairs,
    iconCount,
    iconPool,
    clock: Math.min(MAX_STAGE_CLOCK, Math.round(pairs * secondsPerPair(n))),
    hints,
    shuffles,
    gravity,
    gold,
    chrono,
    ice,
    bomb,
    bombFuse: bomb > 0 ? Math.max(MIN_STAGE_BOMB_FUSE, BASE_STAGE_BOMB_FUSE - Math.floor((n - INTRODUCES.bomb) / 4)) : 0,
    stars: { silver, gold: goldScore },
  };
}

/**
 * Generates human-readable stage objective text for the HUD.
 *
 * @param stage - Stage number.
 * @returns `StageObjective` descriptor.
 */
export function stageObjective(stage: number): StageObjective {
  const { stars, pairs } = stageConfig(stage);
  return {
    target: stars.gold,
    text: `Clear the board — ${stars.gold.toLocaleString('en-US')} pts for three stars`,
    pairs,
  };
}

/**
 * Computes earned star count (0 to 3) based on stage outcome and final score.
 *
 * @param stage - Stage number.
 * @param options - Outcome flags and score.
 * @returns 0 if not cleared, 1 for clearing, 2 for silver score, 3 for gold score.
 */
export function stageStars(stage: number, { cleared = false, score = 0 }: StageStarsOptions = {}): number {
  if (!cleared) return 0;
  const { stars } = stageConfig(stage);
  if (score >= stars.gold) return 3;
  if (score >= stars.silver) return 2;
  return 1;
}

/**
 * Summarizes the stage rules and hazards in a single string for HUD display.
 *
 * @param stage - Stage number.
 * @returns Concise summary string.
 */
export function describeStage(stage: number): string {
  const config = stageConfig(stage);
  const notes = [`${config.rows}×${config.cols}`];

  if (config.gravity !== 'none') {
    notes.push(GRAVITY_LABELS[config.gravity]);
  }
  if (config.gold > 0) {
    notes.push(`${config.gold} gold`);
  }
  if (config.chrono > 0) {
    notes.push(`${config.chrono} chrono`);
  }
  if (config.ice > 0) {
    notes.push(`${config.ice} iced`);
  }
  if (config.bomb > 0) {
    notes.push(`${config.bomb} bomb${config.bomb > 1 ? 's' : ''}`);
  }

  return notes.join(' · ');
}
