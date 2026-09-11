/**
 * One player's run through a board: selection, scoring, hints and shuffles.
 *
 * A duel is simply two sessions built from the same seed, so both players face
 * an identical layout and the only variable is how fast they read it.
 */

import { createBoard, isEmpty, getTile, removeTiles } from './board.js';
import { findPath, findAnyMove, reshuffle } from './connect.js';
import { deriveSeed } from './rng.js';

export const MATCH_SCORE = 100;
export const STREAK_BONUS = 25;

export function createSession({
  board,
  rows = 8,
  cols = 8,
  iconCount = 16,
  seed = 1,
  hints = 3,
  shuffles = 3,
  label = 'Player',
} = {}) {
  return {
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
  };
}

function nextShuffleSeed(session) {
  session.reshuffles += 1;
  return deriveSeed(session.seed, session.reshuffles * 7 + 1);
}

function breakStreak(session) {
  session.streak = 0;
  session.mistakes += 1;
}

/**
 * Handle a click / keypress on (r, c).
 * Returns one of: select, deselect, match, mismatch, blocked, invalid.
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

  removeTiles(session.board, previous, tile);
  session.selected = null;
  session.hint = null;
  session.matchedPairs += 1;
  session.streak += 1;
  session.bestStreak = Math.max(session.bestStreak, session.streak);

  const gained = MATCH_SCORE + (session.streak - 1) * STREAK_BONUS;
  session.score += gained;

  const won = session.board.remaining === 0;
  if (won) session.status = 'won';

  // Never leave a player staring at a board they cannot play.
  let autoShuffled = false;
  if (!won && !findAnyMove(session.board)) {
    autoShuffled = reshuffle(session.board, nextShuffleSeed(session));
  }

  return { type: 'match', path, cleared: [previous, tile], gained, won, autoShuffled };
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
