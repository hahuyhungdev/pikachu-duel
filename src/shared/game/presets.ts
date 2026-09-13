/**
 * Board preset dimensions and difficulty escalation definitions.
 *
 * Provides standardized board configurations for Easy (Quick), Normal (Classic),
 * and Hard (Grand) modes, along with responsive portrait adaptations and
 * level scaling formulas.
 */

import { MAX_ICONS } from '../../game/icons.ts';
import type { Difficulty } from '../types/board.types.ts';

/** Board presets by difficulty */
export const EASY_ROWS = 8;
export const EASY_COLS = 10;
export const EASY_ICON_COUNT = 16;
export const EASY_HINTS = 3;
export const EASY_SHUFFLES = 3;
export const EASY_LEVEL = 1;

export const NORMAL_ROWS = 9;
export const NORMAL_COLS = 16;
export const NORMAL_ICON_COUNT = 24;
export const NORMAL_HINTS = 2;
export const NORMAL_SHUFFLES = 2;
export const NORMAL_LEVEL = 2;

export const HARD_ROWS = 12;
export const HARD_COLS = 16;
export const HARD_HINTS = 1;
export const HARD_SHUFFLES = 1;
export const HARD_LEVEL = 3;

/** Clock decrement applied per difficulty escalation tier. */
export const ESCALATION_CLOCK_DECREMENT_SECONDS = 60;

/** Minimum clock duration limit when escalating difficulty. */
export const MIN_ESCALATION_CLOCK_SECONDS = 60;

/** Default starting clock timer for classic games. */
export const DEFAULT_STARTING_CLOCK_SECONDS = 300;

/** Configuration definition for a gameplay difficulty preset. */
export interface DifficultyPreset {
  readonly label: string;
  readonly difficultyLabel: 'Easy' | 'Medium' | 'Hard';
  readonly rows: number;
  readonly cols: number;
  readonly iconCount: number;
  readonly hints: number;
  readonly shuffles: number;
  readonly level: number;
}

const normalPreset: DifficultyPreset = {
  label: 'Classic',
  difficultyLabel: 'Medium',
  rows: NORMAL_ROWS,
  cols: NORMAL_COLS,
  iconCount: NORMAL_ICON_COUNT,
  hints: NORMAL_HINTS,
  shuffles: NORMAL_SHUFFLES,
  level: NORMAL_LEVEL,
};

/** Shared difficulty presets keyed by difficulty identifier. */
export const PRESETS: Record<Difficulty, DifficultyPreset> & { medium: DifficultyPreset } = {
  easy: {
    label: 'Quick',
    difficultyLabel: 'Easy',
    rows: EASY_ROWS,
    cols: EASY_COLS,
    iconCount: EASY_ICON_COUNT,
    hints: EASY_HINTS,
    shuffles: EASY_SHUFFLES,
    level: EASY_LEVEL,
  },
  normal: normalPreset,
  medium: normalPreset,
  hard: {
    label: 'Grand',
    difficultyLabel: 'Hard',
    rows: HARD_ROWS,
    cols: HARD_COLS,
    iconCount: MAX_ICONS,
    hints: HARD_HINTS,
    shuffles: HARD_SHUFFLES,
    level: HARD_LEVEL,
  },
};

/** Options for resolving a difficulty preset. */
export interface GetPresetOptions {
  portrait?: boolean;
}

/**
 * Normalizes user or saved difficulty strings to canonical difficulty keys ('easy', 'normal', 'hard').
 *
 * @param difficulty - The raw difficulty string.
 * @returns The normalized Difficulty string.
 */
export function normalizeDifficulty(difficulty: string): Difficulty {
  if (difficulty === 'medium') return 'normal';
  if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') {
    return difficulty;
  }
  return 'normal';
}

/**
 * Retrieves the difficulty preset configuration, optionally swapping rows and cols for portrait viewports.
 *
 * @param difficulty - Difficulty tier or key.
 * @param options - Options including portrait mode flag.
 * @returns The resolved `DifficultyPreset`.
 */
export function getPreset(difficulty: string, { portrait = false }: GetPresetOptions = {}): DifficultyPreset {
  const base = PRESETS[normalizeDifficulty(difficulty)];
  if (portrait && base.cols > base.rows) {
    return {
      ...base,
      rows: base.cols,
      cols: base.rows,
    };
  }
  return base;
}

/** Result of calculating the next escalation level. */
export interface NextLevelResult {
  level: number;
  difficulty: Difficulty;
  clock: number;
}

/**
 * Calculates next level and escalated difficulty.
 * Easy (Level 1) -> Medium (Level 2) -> Hard (Level 3) -> Escalated clock (-60s)
 *
 * @param currentDifficulty - Current difficulty level key.
 * @param currentLevel - Current progression level index.
 * @param currentClock - Current remaining or allotted clock seconds.
 * @returns The escalated level, difficulty, and clock settings.
 */
export function calculateNextLevel(
  currentDifficulty: string,
  currentLevel: number = 1,
  currentClock: number = DEFAULT_STARTING_CLOCK_SECONDS
): NextLevelResult {
  const normalized = normalizeDifficulty(currentDifficulty);
  const nextLevel = (Number(currentLevel) || 1) + 1;
  let nextDifficulty: Difficulty = 'hard';
  let nextClock = Number(currentClock) || 0;

  if (normalized === 'easy') {
    nextDifficulty = 'normal';
  } else if (normalized === 'normal') {
    nextDifficulty = 'hard';
  } else if (nextClock > MIN_ESCALATION_CLOCK_SECONDS) {
    nextClock = Math.max(MIN_ESCALATION_CLOCK_SECONDS, nextClock - ESCALATION_CLOCK_DECREMENT_SECONDS);
  }

  return {
    level: nextLevel,
    difficulty: nextDifficulty,
    clock: nextClock,
  };
}
