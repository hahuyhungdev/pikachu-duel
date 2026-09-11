/**
 * The Adventure ladder — one deterministic stage recipe per stage number.
 *
 * The ladder is what turns a single board into a run worth repeating. Nothing
 * here is random: stage 14 is always the same shape for everybody, so "I died
 * on 14" is a score people can compare and chase. Each twist (gravity, then
 * each special tile) is introduced alone and a few stages apart, so the player
 * always knows which new rule just killed them.
 */

import { MAX_ICONS } from './icons.js';
import { GRAVITY_LABELS, GRAVITY_MODES } from './gravity.js';

export const FIRST_STAGE = 1;

/** The stage each twist first appears on. */
export const INTRODUCES = {
  gravity: 4,
  gold: 3,
  ice: 6,
  bomb: 9,
};

/**
 * Board shapes, widening before they deepen so the playfield stays landscape.
 * The last entry repeats forever — past it the pressure comes from the clock.
 */
const SHAPES = [
  { rows: 6, cols: 8 },
  { rows: 6, cols: 10 },
  { rows: 8, cols: 10 },
  { rows: 8, cols: 12 },
  { rows: 8, cols: 14 },
  { rows: 9, cols: 16 },
  { rows: 10, cols: 16 },
  { rows: 12, cols: 16 },
];

/** Gravity variants in the order the ladder hands them out, gentlest first. */
const GRAVITY_ROTATION = GRAVITY_MODES.filter((mode) => mode !== 'none');

function clampStage(stage) {
  const n = Math.trunc(Number(stage));
  return Number.isFinite(n) && n > FIRST_STAGE ? n : FIRST_STAGE;
}

/** Stages step up a shape every two stages until the ladder runs out of shapes. */
function shapeFor(stage) {
  const step = Math.min(SHAPES.length - 1, Math.floor((stage - FIRST_STAGE) / 2));
  return SHAPES[step];
}

/**
 * Seconds per pair, easing down from generous to tight and then holding.
 * Held rather than driven to zero, because a stage nobody can finish stops
 * being a challenge and starts being a wall.
 */
function secondsPerPair(stage) {
  const eased = 6.5 - (stage - FIRST_STAGE) * 0.16;
  return Math.max(2.6, eased);
}

function countFor(stage, from, per, cap) {
  if (stage < from) return 0;
  return Math.min(cap, 1 + Math.floor((stage - from) / per));
}

/**
 * Everything one Adventure stage needs: board shape, clock, aids, gravity and
 * how many of each special tile to scatter.
 */
export function stageConfig(stage) {
  const n = clampStage(stage);
  const { rows, cols } = shapeFor(n);
  const pairs = (rows * cols) / 2;

  const gravity =
    n < INTRODUCES.gravity
      ? 'none'
      : GRAVITY_ROTATION[Math.floor((n - INTRODUCES.gravity) / 2) % GRAVITY_ROTATION.length];

  const gold = countFor(n, INTRODUCES.gold, 3, 6);
  const ice = countFor(n, INTRODUCES.ice, 4, 6);
  const bomb = countFor(n, INTRODUCES.bomb, 5, 3);

  // Aids thin out over the first dozen stages and then stay at one apiece, so
  // deep runs are tense without being hopeless.
  const hints = Math.max(1, 3 - Math.floor((n - FIRST_STAGE) / 5));
  const shuffles = Math.max(1, 3 - Math.floor((n - FIRST_STAGE) / 6));

  // A clean clear pays roughly 100 a pair plus streak bonuses; the thresholds
  // sit above that so stars mean "kept a streak alive", not "turned up".
  const silver = Math.round(pairs * 130);
  const goldScore = Math.round(pairs * 190 + n * 40);

  return {
    stage: n,
    rows,
    cols,
    pairs,
    iconCount: Math.min(MAX_ICONS, Math.max(8, Math.min(pairs, 10 + Math.floor(n / 2)))),
    clock: Math.round(pairs * secondsPerPair(n)),
    hints,
    shuffles,
    gravity,
    gold,
    ice,
    bomb,
    bombFuse: bomb > 0 ? Math.max(6, 16 - n) : 0,
    stars: { silver, gold: goldScore },
  };
}

/** The score the player is chasing on this stage, phrased for the HUD. */
export function stageObjective(stage) {
  const { stars } = stageConfig(stage);
  return {
    target: stars.gold,
    text: `Clear the board — ${stars.gold.toLocaleString('en-US')} pts for three stars`,
  };
}

/** 0 for a failed run, then one star for clearing and two more for scoring. */
export function stageStars(stage, { cleared = false, score = 0 } = {}) {
  if (!cleared) return 0;
  const { stars } = stageConfig(stage);
  if (score >= stars.gold) return 3;
  if (score >= stars.silver) return 2;
  return 1;
}

/** A one-line "here is what is different about this stage" for the HUD. */
export function describeStage(stage) {
  const config = stageConfig(stage);
  const notes = [`${config.rows}×${config.cols}`];

  if (config.gravity !== 'none') notes.push(GRAVITY_LABELS[config.gravity]);
  if (config.gold > 0) notes.push(`${config.gold} gold`);
  if (config.ice > 0) notes.push(`${config.ice} iced`);
  if (config.bomb > 0) notes.push(`${config.bomb} bomb${config.bomb > 1 ? 's' : ''}`);

  return notes.join(' · ');
}
