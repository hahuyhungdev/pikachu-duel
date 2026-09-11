/**
 * Game modes — the answer to "what am I playing for this time?".
 *
 * Classic is the original duel board. The four modes around it each take the
 * same matching rules and change only what running out means: Adventure spends
 * a life, Time Attack pays you clock for playing well, the Daily is one shared
 * board a day, and Zen removes the clock entirely.
 *
 * A mode is plain data. `buildRound` is the single place that turns a mode plus
 * a stage or difficulty into the concrete recipe the session is dealt from.
 */

import { PRESETS, normalizeDifficulty } from '../shared/game/presets.js';
import { FIRST_STAGE, stageConfig } from './stages.js';

const NO_TIME_GAIN = { match: 0, fever: 0 };

export const MODES = {
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'One board, one clock. The original duel.',
    ladder: false,
    timed: true,
    hearts: 0,
    startClock: 300,
    timeGain: NO_TIME_GAIN,
    tracksBest: 'score',
  },
  adventure: {
    id: 'adventure',
    label: 'Adventure',
    blurb: 'Climb the stages. Three lives. How deep can you get?',
    ladder: true,
    timed: true,
    hearts: 3,
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
    startClock: 60,
    timeGain: { match: 2, fever: 4 },
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

export const MODE_IDS = Object.keys(MODES);

export function isGameMode(id) {
  return Object.prototype.hasOwnProperty.call(MODES, id);
}

/** Always hands back real rules — an unknown id plays Classic. */
export function modeRules(id) {
  return isGameMode(id) ? MODES[id] : MODES.classic;
}

/** The local calendar day, which is what "today's board" has to mean. */
export function dailyKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** One board per day, identical for every player, derived from nothing but the date. */
export function dailySeed(date = new Date()) {
  const [y, m, d] = dailyKey(date).split('-').map(Number);
  const ordinal = y * 10000 + m * 100 + d;
  const mixed = (Math.imul(ordinal, 0x9e3779b1) ^ (ordinal << 7)) >>> 0;
  return mixed || 1;
}

/**
 * The Daily sits in the middle of the ladder: past the tutorial stages, short
 * of the ones that need a warm-up run, so a single attempt is a fair test.
 */
export function dailyStage(date = new Date()) {
  return 3 + (dailySeed(date) % 13);
}

/**
 * Turn a mode into the concrete round to deal.
 *
 * Treats its argument as read-only and always returns every field the session
 * and the HUD need, so no caller has to know which mode uses the ladder.
 */
export function buildRound({ mode, stage, difficulty, seed, clock, now } = {}) {
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
    ? stageConfig(effectiveStage)
    : (() => {
        const preset = PRESETS[normalizeDifficulty(difficulty)];
        return {
          rows: preset.rows,
          cols: preset.cols,
          pairs: (preset.rows * preset.cols) / 2,
          iconCount: preset.iconCount,
          clock: Number(clock) > 0 ? Number(clock) : rules.startClock,
          hints: preset.hints,
          shuffles: preset.shuffles,
          gravity: 'none',
          gold: 0,
          ice: 0,
          bomb: 0,
          bombFuse: 0,
          stars: { silver: 0, gold: 0 },
        };
      })();

  // Time Attack overrides the stage's clock — the short starting clock is the
  // whole point of the mode, and the player earns the rest of it back.
  let roundClock = base.clock;
  if (!rules.timed) roundClock = 0;
  else if (rules.startClock > 0 && rules.id === 'timeattack') roundClock = rules.startClock;
  else if (!rules.ladder) roundClock = Number(clock) > 0 ? Number(clock) : rules.startClock;

  return {
    mode: rules.id,
    label: rules.label,
    stage: effectiveStage,
    seed: effectiveSeed,
    rows: base.rows,
    cols: base.cols,
    pairs: base.pairs,
    iconCount: base.iconCount,
    clock: roundClock,
    timed: rules.timed,
    hearts: rules.hearts,
    timeGain: { ...rules.timeGain },
    hints: base.hints,
    shuffles: base.shuffles,
    gravity: base.gravity,
    gold: base.gold,
    ice: base.ice,
    bomb: base.bomb,
    bombFuse: base.bombFuse,
    stars: { ...base.stars },
    day: isDaily ? dailyKey(when) : null,
  };
}
