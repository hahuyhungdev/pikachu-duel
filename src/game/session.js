/**
 * One player's run through a board: selection, scoring, hints and shuffles.
 *
 * A duel is simply two sessions built from the same seed, so both players face
 * an identical layout and the only variable is how fast they read it.
 *
 * On top of that base game sit the three things that make one round feel unlike
 * the last, all optional and all off by default:
 *   - a combo that escalates into fever and multiplies the score,
 *   - special tiles (gold, ice, bomb) scattered over the deal,
 *   - gravity, which collapses the board into the hole a cleared pair left.
 */

import { createBoard, isEmpty, getTile, removeTiles } from './board.js';
import { findPath, findAnyMove, reshuffle } from './connect.js';
import { deriveSeed } from './rng.js';
import { applyGravity, normalizeGravity } from './gravity.js';
import { BOMB_PENALTY_SECONDS, resolveMatchMarks, sprinkleMarks, tickBombs } from './marks.js';

export const MATCH_SCORE = 100;
export const STREAK_BONUS = 25;

/** Matches in a row before the board catches fire. */
export const FEVER_STREAK = 8;
export const FEVER_MULTIPLIER = 2;

/** The streak each combo tier starts at; the index into this list is the tier. */
export const COMBO_TIERS = [0, 3, 5, FEVER_STREAK];

/** Cracking ice is progress, not a clear, so it pays a fraction of a match. */
export const CRACK_SCORE_RATIO = 0.4;

/** Which combo band a streak falls into — 0 for cold, 3 for fever. */
export function comboTier(streak) {
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i += 1) {
    if (streak >= COMBO_TIERS[i]) tier = i;
  }
  return tier;
}

export function createSession({
  board,
  rows = 8,
  cols = 8,
  iconCount = 16,
  seed = 1,
  hints = 3,
  shuffles = 3,
  label = 'Player',
  gravity = 'none',
  gold = 0,
  ice = 0,
  bomb = 0,
  bombFuse = 12,
  chrono = 0,
  timeGain = null,
} = {}) {
  const session = {
    label,
    seed,
    board: board ?? createBoard({ rows, cols, iconCount, seed }),
    status: 'playing',
    selected: null,
    hint: null,
    score: 0,
    matchedPairs: 0,
    streak: 0,
    bestStreak: 0,
    mistakes: 0,
    hintsLeft: hints,
    shufflesLeft: shuffles,
    reshuffles: 0,
    gravity: normalizeGravity(gravity),
    tier: 0,
    fever: false,
    timeGain: { match: 0, fever: 0, ...(timeGain ?? {}) },
  };

  if (gold > 0 || ice > 0 || bomb > 0 || chrono > 0) {
    sprinkleMarks(session.board, { seed: deriveSeed(seed, 991), gold, ice, bomb, bombFuse, chrono });
  }

  return session;
}

function nextShuffleSeed(session) {
  session.reshuffles += 1;
  return deriveSeed(session.seed, session.reshuffles * 7 + 1);
}

function breakStreak(session) {
  session.streak = 0;
  session.tier = 0;
  session.fever = false;
  session.mistakes += 1;
}

/**
 * Handle a click / keypress on (r, c).
 * Returns one of: select, deselect, match, crack, mismatch, blocked, invalid.
 */
export function select(session, r, c) {
  if (session.status !== 'playing') return { type: 'invalid', reason: 'finished' };
  if (isEmpty(session.board, r, c)) return { type: 'invalid', reason: 'no-tile' };

  const tile = { r, c };
  const previous = session.selected;

  if (!previous) {
    session.selected = tile;
    return { type: 'select', tile };
  }

  if (previous.r === r && previous.c === c) {
    session.selected = null;
    return { type: 'deselect', tile };
  }

  const attempted = [previous, tile];

  if (getTile(session.board, previous.r, previous.c) !== getTile(session.board, r, c)) {
    session.selected = tile;
    breakStreak(session);
    return { type: 'mismatch', attempted, tile };
  }

  const path = findPath(session.board, previous, tile);
  if (!path) {
    session.selected = tile;
    breakStreak(session);
    return { type: 'blocked', attempted, tile };
  }

  // The pair connects. Work out what its marks do before anything is removed.
  const marks = resolveMatchMarks(session.board, previous, tile);

  session.streak += 1;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  session.tier = comboTier(session.streak);
  session.fever = session.streak >= FEVER_STREAK;

  const base = MATCH_SCORE + (session.streak - 1) * STREAK_BONUS;
  const feverFactor = session.fever ? FEVER_MULTIPLIER : 1;
  const crackFactor = marks.survives ? CRACK_SCORE_RATIO : 1;
  const gained = Math.round(base * marks.multiplier * feverFactor * crackFactor);
  session.score += gained;

  if (!marks.survives) {
    removeTiles(session.board, previous, tile);
    session.matchedPairs += 1;
  }
  session.selected = null;
  session.hint = null;

  // Bombs burn down on progress, not on time, so a stalled player is safe and
  // a fast one has to keep an eye on the fuses they are lighting.
  const exploded = tickBombs(session.board);
  const timeDelta =
    (session.fever ? session.timeGain.fever : session.timeGain.match) -
    exploded.length * BOMB_PENALTY_SECONDS +
    (marks.timeGain || 0);
  const timeFreeze = marks.timeFreeze || 0;

  const won = session.board.remaining === 0;
  if (won) session.status = 'won';

  const moves = marks.survives || won ? [] : applyGravity(session.board, session.gravity);

  // Never leave a player staring at a board they cannot play.
  let autoShuffled = false;
  if (!won && !findAnyMove(session.board)) {
    autoShuffled = reshuffle(session.board, nextShuffleSeed(session));
  }

  return {
    type: marks.survives ? 'crack' : 'match',
    path,
    cleared: marks.survives ? [] : [previous, tile],
    cracked: marks.cracked,
    exploded,
    moves,
    multiplier: marks.multiplier,
    tier: session.tier,
    fever: session.fever,
    timeDelta,
    timeFreeze,
    gained,
    won,
    autoShuffled,
  };
}

export function requestHint(session) {
  if (session.status !== 'playing' || session.hintsLeft <= 0) return null;
  const move = findAnyMove(session.board);
  if (!move) return null;
  session.hintsLeft -= 1;
  session.hint = move;
  return move;
}

export function requestShuffle(session) {
  if (session.status !== 'playing' || session.shufflesLeft <= 0) return false;
  const ok = reshuffle(session.board, nextShuffleSeed(session));
  if (!ok) return false;
  session.shufflesLeft -= 1;
  session.selected = null;
  session.hint = null;
  return true;
}

/** Called when the clock runs out. */
export function timeOut(session) {
  if (session.status === 'playing') session.status = 'lost';
  return session;
}
