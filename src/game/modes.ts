/**
 * Game modes and round recipe builder.
 *
 * Defines the rule variations for Classic, Adventure, Time Attack, Daily Challenge,
 * and Zen modes, providing a unified `buildRound` factory to deal game boards.
 */

import { getPreset } from '../shared/game/presets.ts';
import type { GravityMode } from './gravity.ts';
import { FIRST_STAGE, stageConfig } from './stages.ts';

/** Starting clocks */
export const CLASSIC_START_CLOCK_SECONDS = 300;
export const TIME_ATTACK_START_CLOCK_SECONDS = 60;
export const TIME_ATTACK_MATCH_GAIN_SECONDS = 2;
export const TIME_ATTACK_FEVER_GAIN_SECONDS = 4;
export const ADVENTURE_START_HEARTS = 3;

/** Daily challenge ladder positioning constants */
export const DAILY_STAGE_BASE = 3;
export const DAILY_STAGE_SPAN = 13;
const DAILY_SEED_PRIME = 0x9e3779b1;

/** Time awarded per match / streak in timed surge modes. */
export interface TimeGainConfig {
  readonly match: number;
  readonly fever: number;
}

const NO_TIME_GAIN: TimeGainConfig = { match: 0, fever: 0 };

/** Canonical identifiers for supported game modes. */
export type GameModeId = 'classic' | 'adventure' | 'timeattack' | 'daily' | 'zen';

/** Specification describing the operational rules of a game mode. */
export interface ModeRules {
  readonly id: GameModeId;
  readonly label: string;
  readonly blurb: string;
  readonly ladder: boolean;
  readonly timed: boolean;
  readonly hearts: number;
  readonly startClock: number;
  readonly timeGain: TimeGainConfig;
  readonly tracksBest: 'score' | 'stage';
}

/** Registry of game mode rule configurations. */
export const MODES: Record<GameModeId, ModeRules> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'One board, one clock. The original duel.',
    ladder: false,
    timed: true,
    hearts: 0,
    startClock: CLASSIC_START_CLOCK_SECONDS,
    timeGain: NO_TIME_GAIN,
    tracksBest: 'score',
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure',
    blurb: 'Climb the stages. Three lives. How deep can you get?',
    ladder: true,
    timed: true,
    hearts: ADVENTURE_START_HEARTS,
    startClock: 0,
    timeGain: NO_TIME_GAIN,
    tracksBest: 'stage',
  },
  timeattack: {
    id: 'timeattack',
    label: 'Time Attack',
    blurb: 'Sixty seconds. Every pair buys you more. Stop matching and it ends.',
    ladder: true,
    timed: true,
    hearts: 0,
    startClock: TIME_ATTACK_START_CLOCK_SECONDS,
    timeGain: { match: TIME_ATTACK_MATCH_GAIN_SECONDS, fever: TIME_ATTACK_FEVER_GAIN_SECONDS },
    tracksBest: 'score',
  },
  daily: {
    id: 'daily',
    label: 'Daily',
    blurb: "Today's board, the same for everyone. One attempt.",
    ladder: true,
    timed: true,
    hearts: 0,
    startClock: 0,
    timeGain: NO_TIME_GAIN,
    tracksBest: 'score',
  },
  zen: {
    id: 'zen',
    label: 'Zen',
    blurb: 'No clock, no lives. Just the board.',
    ladder: false,
    timed: false,
    hearts: 0,
    startClock: 0,
    timeGain: NO_TIME_GAIN,
    tracksBest: 'score',
  },
};

/** List of all valid mode ID strings. */
export const MODE_IDS = Object.keys(MODES) as GameModeId[];

/**
 * Validates if an identifier matches a recognized `GameModeId`.
 *
 * @param id - The identifier to test.
 * @returns True if `id` is a key of `MODES`.
 */
export function isGameMode(id: unknown): id is GameModeId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MODES, id);
}

/**
 * Resolves the rules for a given game mode, defaulting to Classic if unrecognized.
 *
 * @param id - Mode ID string.
 * @returns The resolved `ModeRules`.
 */
export function modeRules(id: unknown): ModeRules {
  return isGameMode(id) ? MODES[id] : MODES.classic;
}

/**
 * Returns the calendar date string ('YYYY-MM-DD') for a given Date.
 *
 * @param date - Target date. Defaults to current date.
 * @returns Formatted date key.
 */
export function dailyKey(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Derives a deterministic daily seed integer from a calendar date.
 *
 * @param date - Target date.
 * @returns Derived unsigned integer seed.
 */
export function dailySeed(date: Date = new Date()): number {
  const [y, m, d] = dailyKey(date).split('-').map(Number);
  const ordinal = y * 10000 + m * 100 + d;
  const mixed = (Math.imul(ordinal, DAILY_SEED_PRIME) ^ (ordinal << 7)) >>> 0;
  return mixed || 1;
}

/**
 * Computes the ladder stage for the daily challenge on a given date.
 *
 * @param date - Target date.
 * @returns Stage number in [3, 15].
 */
export function dailyStage(date: Date = new Date()): number {
  return DAILY_STAGE_BASE + (dailySeed(date) % DAILY_STAGE_SPAN);
}

/** Options provided to build a concrete round recipe. */
export interface BuildRoundOptions {
  mode?: string;
  stage?: number;
  difficulty?: string;
  seed?: number;
  clock?: number;
  now?: Date;
  portrait?: boolean;
}

/** Fully resolved round recipe ready to deal. */
export interface RoundRecipe {
  mode: GameModeId;
  label: string;
  stage: number;
  seed: number;
  rows: number;
  cols: number;
  pairs: number;
  iconCount: number;
  iconPool?: readonly number[];
  clock: number;
  timed: boolean;
  hearts: number;
  timeGain: TimeGainConfig;
  hints: number;
  shuffles: number;
  gravity: GravityMode;
  gold: number;
  chrono: number;
  ice: number;
  bomb: number;
  bombFuse: number;
  stars: { silver: number; gold: number };
  day: string | null;
}

/**
 * Builds a concrete round recipe from mode parameters, calculating board dimensions,
 * clock, special tiles, and ladder configuration.
 *
 * @param options - Build round parameters.
 * @returns Fully populated `RoundRecipe`.
 */
export function buildRound({
  mode,
  stage,
  difficulty = 'normal',
  seed,
  clock,
  now,
  portrait = false,
}: BuildRoundOptions = {}): RoundRecipe {
  const rules = modeRules(mode);
  const when = now instanceof Date ? now : new Date();
  const isDaily = rules.id === 'daily';

  const effectiveStage = rules.ladder
    ? isDaily
      ? dailyStage(when)
      : Math.max(FIRST_STAGE, Math.trunc(Number(stage)) || FIRST_STAGE)
    : FIRST_STAGE;

  const effectiveSeed = isDaily ? dailySeed(when) : Number(seed) > 0 ? Number(seed) : 1;

  const base = rules.ladder
    ? stageConfig(effectiveStage, { portrait })
    : (() => {
        const preset = getPreset(difficulty, { portrait });
        return {
          rows: preset.rows,
          cols: preset.cols,
          pairs: (preset.rows * preset.cols) / 2,
          iconCount: preset.iconCount,
          clock: Number(clock) > 0 ? Number(clock) : rules.startClock,
          hints: preset.hints,
          shuffles: preset.shuffles,
          gravity: 'none' as GravityMode,
          gold: 0,
          chrono: 0,
          ice: 0,
          bomb: 0,
          bombFuse: 0,
          stars: { silver: 0, gold: 0 },
        };
      })();

  let roundClock = base.clock;
  if (!rules.timed) {
    roundClock = 0;
  } else if (rules.startClock > 0 && rules.id === 'timeattack') {
    roundClock = rules.startClock;
  } else if (!rules.ladder) {
    roundClock = Number(clock) > 0 ? Number(clock) : rules.startClock;
  }

  return {
    mode: rules.id,
    label: rules.label,
    stage: effectiveStage,
    seed: effectiveSeed,
    rows: base.rows,
    cols: base.cols,
    pairs: base.pairs,
    iconCount: base.iconCount,
    iconPool: 'iconPool' in base ? (base as { iconPool?: readonly number[] }).iconPool : undefined,
    clock: roundClock,
    timed: rules.timed,
    hearts: rules.hearts,
    timeGain: { ...rules.timeGain },
    hints: base.hints,
    shuffles: base.shuffles,
    gravity: base.gravity,
    gold: base.gold,
    chrono: base.chrono || 0,
    ice: base.ice,
    bomb: base.bomb,
    bombFuse: base.bombFuse,
    stars: { ...base.stars },
    day: isDaily ? dailyKey(when) : null,
  };
}
