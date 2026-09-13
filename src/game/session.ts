/**
 * Player session state engine, tile selection, and scoring rules.
 *
 * Manages one player's active game session:
 * - Selection handling, path verification, and match resolution.
 * - Dynamic combo tiers, Fever mode multipliers, and Rush window timers.
 * - Special hazard interactions (Ice cracking, Gold bonus, Bomb penalties, Chrono freeze).
 * - Post-match gravity compaction and automatic reshuffles on dead boards.
 */

import type { Point } from '../shared/types/board.types.ts';
import type { DealtBoard } from './board.ts';
import { createBoard, getTile, isEmpty, removeTiles } from './board.ts';
import type { MoveHint } from './connect.ts';
import { findAnyMove, findPath, reshuffle } from './connect.ts';
import type { GravityMove } from './gravity.ts';
import { applyGravity, normalizeGravity } from './gravity.ts';
import type { BoardWithMarks } from './marks.ts';
import { BOMB_PENALTY_SECONDS, resolveMatchMarks, sprinkleMarks, tickBombs } from './marks.ts';
import type { TimeGainConfig } from './modes.ts';
import { deriveSeed } from './rng.ts';

/** Base score points awarded for a matched tile pair. */
export const MATCH_SCORE = 100;

/** Extra points awarded per streak count above 1. */
export const STREAK_BONUS = 25;

/** Consecutive matches required to trigger standard Fever mode. */
export const FEVER_STREAK = 8;

/** Multiplier applied to score while Fever mode is active. */
export const FEVER_MULTIPLIER = 2;

/** Duration window in milliseconds to maintain a Rush mode combo. */
export const RUSH_WINDOW_MS = 5000;

/** Consecutive matches required to trigger Fever mode under Rush rules. */
export const RUSH_FEVER_STREAK = 5;

/** Streak threshold milestones corresponding to combo tier levels 0, 1, 2, and 3. */
export const COMBO_TIERS: readonly number[] = [0, 3, 5, FEVER_STREAK];

/** Score multiplier applied when cracking ice (intermediate progress, not full clear). */
export const CRACK_SCORE_RATIO = 0.4;

/** Session creation parameter defaults */
const DEFAULT_ROWS = 8;
const DEFAULT_COLS = 8;
const DEFAULT_ICON_COUNT = 16;
const DEFAULT_SEED = 1;
const DEFAULT_HINTS = 3;
const DEFAULT_SHUFFLES = 3;
const DEFAULT_LABEL = 'Player';
const DEFAULT_BOMB_FUSE = 12;

/** Derivation step constants */
const SPRINKLE_SEED_STEP = 991;
const SHUFFLE_STEP_MULTIPLIER = 7;
const SHUFFLE_STEP_OFFSET = 1;

/** Session status states. */
export type SessionStatus = 'playing' | 'won' | 'lost';

/** Represents an active game session for one player. */
export interface Session {
  label: string;
  seed: number;
  board: DealtBoard & BoardWithMarks;
  status: SessionStatus;
  selected: Point | null;
  hint: MoveHint | null;
  score: number;
  matchedPairs: number;
  streak: number;
  bestStreak: number;
  mistakes: number;
  hintsLeft: number;
  shufflesLeft: number;
  reshuffles: number;
  gravity?: string;
  tier?: number;
  fever?: boolean;
  rush?: boolean;
  comboExpiresAt?: number;
  feverRewarded?: boolean;
  timeGain?: Partial<TimeGainConfig>;
}

/** Configuration options for initializing a new gameplay session. */
export interface CreateSessionOptions {
  board?: DealtBoard & BoardWithMarks;
  rows?: number;
  cols?: number;
  iconCount?: number;
  iconPool?: readonly number[];
  seed?: number;
  hints?: number;
  shuffles?: number;
  label?: string;
  gravity?: string;
  gold?: number;
  ice?: number;
  bomb?: number;
  bombFuse?: number;
  chrono?: number;
  timeGain?: Partial<TimeGainConfig> | null;
  rush?: boolean;
}

/** Result outcome of attempting to select or match a tile. */
export interface SelectResult {
  type: 'select' | 'deselect' | 'match' | 'crack' | 'mismatch' | 'blocked' | 'invalid';
  reason?: 'finished' | 'no-tile';
  tile?: Point;
  attempted?: Point[];
  path?: Point[];
  cleared?: Point[];
  cracked?: Point[];
  exploded?: Point[];
  moves?: GravityMove[];
  multiplier?: number;
  tier?: number;
  fever?: boolean;
  timeDelta?: number;
  timeFreeze?: number;
  gained?: number;
  won?: boolean;
  autoShuffled?: boolean;
}

/**
 * Calculates which combo band a streak count falls into (0 for cold, 3 for fever).
 *
 * @param streak - Current consecutive match count.
 * @returns Tier index (0 to 3).
 */
export function comboTier(streak: number): number {
  let tier = 0;
  for (let i = 0; i < COMBO_TIERS.length; i += 1) {
    if (streak >= COMBO_TIERS[i]) tier = i;
  }
  return tier;
}

/**
 * Creates and initializes a new gameplay session.
 *
 * @param options - Session parameters.
 * @returns Fully populated `Session`.
 */
export function createSession({
  board,
  rows = DEFAULT_ROWS,
  cols = DEFAULT_COLS,
  iconCount = DEFAULT_ICON_COUNT,
  iconPool,
  seed = DEFAULT_SEED,
  hints = DEFAULT_HINTS,
  shuffles = DEFAULT_SHUFFLES,
  label = DEFAULT_LABEL,
  gravity = 'none',
  gold = 0,
  ice = 0,
  bomb = 0,
  bombFuse = DEFAULT_BOMB_FUSE,
  chrono = 0,
  timeGain = null,
  rush = false,
}: CreateSessionOptions = {}): Session {
  const session: Session = {
    label,
    seed,
    board: (board ?? createBoard({ rows, cols, iconCount, iconPool, seed })) as DealtBoard & BoardWithMarks,
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
    rush,
    comboExpiresAt: 0,
    feverRewarded: false,
    timeGain: { match: 0, fever: 0, ...(timeGain ?? {}) },
  };

  if (gold > 0 || ice > 0 || bomb > 0 || chrono > 0) {
    sprinkleMarks(session.board, {
      seed: deriveSeed(seed, SPRINKLE_SEED_STEP),
      gold,
      ice,
      bomb,
      bombFuse,
      chrono,
    });
  }

  return session;
}

/**
 * Generates the derived PRNG seed for the next board reshuffle.
 */
function nextShuffleSeed(session: Session): number {
  session.reshuffles += 1;
  return deriveSeed(session.seed, session.reshuffles * SHUFFLE_STEP_MULTIPLIER + SHUFFLE_STEP_OFFSET);
}

/**
 * Resets streak, combo tier, and fever flags upon mistake or invalid match.
 */
function breakStreak(session: Session): void {
  session.streak = 0;
  session.tier = 0;
  session.fever = false;
  session.comboExpiresAt = 0;
  session.mistakes += 1;
}

/**
 * Checks and expires a timed Rush combo if elapsed past `comboExpiresAt`.
 *
 * @param session - Target session.
 * @param now - Current timestamp in ms.
 * @returns True if the combo expired and was reset.
 */
export function expireCombo(session: Session, now: number = Date.now()): boolean {
  if (!session.rush || !session.comboExpiresAt || now < session.comboExpiresAt) return false;
  session.streak = 0;
  session.tier = 0;
  session.fever = false;
  session.comboExpiresAt = 0;
  return true;
}

/**
 * Handles a user click or keypress interaction on coordinates (r, c).
 *
 * @param session - Target session.
 * @param r - Row index.
 * @param c - Column index.
 * @param now - Interaction timestamp in ms.
 * @returns Detailed `SelectResult` describing what occurred.
 */
export function select(session: Session, r: number, c: number, now: number = Date.now()): SelectResult {
  if (session.status !== 'playing') {
    return { type: 'invalid', reason: 'finished' };
  }
  expireCombo(session, now);
  if (isEmpty(session.board, r, c)) {
    return { type: 'invalid', reason: 'no-tile' };
  }

  const tile: Point = { r, c };
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

  // The pair connects legally: calculate mark interactions.
  const marks = resolveMatchMarks(session.board, previous, tile);

  session.streak += 1;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  session.tier = comboTier(session.streak);
  session.fever = session.streak >= (session.rush ? RUSH_FEVER_STREAK : FEVER_STREAK);

  if (session.rush) {
    session.comboExpiresAt = now + RUSH_WINDOW_MS;
    if (session.fever) session.tier = 3;
    if (session.fever && !session.feverRewarded) {
      session.hintsLeft += 1;
      session.feverRewarded = true;
    }
  }

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

  const exploded = tickBombs(session.board);
  const timeGain = session.timeGain ?? { match: 0, fever: 0 };
  const timeDelta =
    (session.fever ? (timeGain.fever ?? 0) : (timeGain.match ?? 0)) -
    exploded.length * BOMB_PENALTY_SECONDS +
    (marks.timeGain || 0);
  const timeFreeze = marks.timeFreeze || 0;

  const won = session.board.remaining === 0;
  if (won) session.status = 'won';

  const sessionGravity = session.gravity ?? 'none';
  const moves = marks.survives || won ? [] : applyGravity(session.board, sessionGravity);

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

/**
 * Requests a move hint. Consumes 1 hint if available and sets `session.hint`.
 *
 * @param session - Target session.
 * @returns The found `MoveHint`, or null if hints are exhausted or none found.
 */
export function requestHint(session: Session): MoveHint | null {
  if (session.status !== 'playing' || session.hintsLeft <= 0) return null;
  const move = findAnyMove(session.board);
  if (!move) return null;
  session.hintsLeft -= 1;
  session.hint = move;
  return move;
}

/**
 * Requests an active board reshuffle. Consumes 1 shuffle if available.
 *
 * @param session - Target session.
 * @returns True if reshuffle succeeded, false otherwise.
 */
export function requestShuffle(session: Session): boolean {
  if (session.status !== 'playing' || session.shufflesLeft <= 0) return false;
  const ok = reshuffle(session.board, nextShuffleSeed(session));
  if (!ok) return false;
  session.shufflesLeft -= 1;
  session.selected = null;
  session.hint = null;
  return true;
}

/**
 * Signals that the game clock expired.
 * Transitions session status to `'lost'` if still `'playing'`.
 *
 * @param session - Target session.
 * @returns Mutated session.
 */
export function timeOut(session: Session): Session {
  if (session.status === 'playing') {
    session.status = 'lost';
  }
  return session;
}
