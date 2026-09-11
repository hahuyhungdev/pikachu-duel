/**
 * Special-tile marks — the layer that makes one board play differently from
 * another without changing what an icon is.
 *
 * A mark rides along with the tile in the cell it sits on, so it is stored in
 * arrays shaped exactly like `board.cells` and moved by the same code that
 * moves tiles. `fuse` is the mark's spare counter: the bomb's remaining moves.
 */

import { EMPTY, getTile, inBounds, listTiles } from './grid.js';
import { createRng, shuffleInPlace } from './rng.js';

export const MARK_NONE = 0;
/** Scores triple. Pure upside — the reason to hunt a specific pair. */
export const MARK_GOLD = 1;
/** Takes two matches to clear: the first one only cracks the ice. */
export const MARK_ICE = 2;
/** Counts down one step per match; reaching zero costs clock time. */
export const MARK_BOMB = 3;
/** Grants clock surge and freezes timer for a few seconds. */
export const MARK_CHRONO = 4;

export const BOMB_PENALTY_SECONDS = 15;
export const CHRONO_SURGE_SECONDS = 8;
export const CHRONO_FREEZE_SECONDS = 5;

/** Score multiplier applied when either half of a matched pair is gold. */
export const GOLD_MULTIPLIER = 3;

function lanes(board) {
  if (!board.marks) board.marks = new Int32Array(board.cells.length);
  if (!board.fuses) board.fuses = new Int32Array(board.cells.length);
  return board;
}

export function getMark(board, r, c) {
  if (!board.marks || !inBounds(board, r, c)) return MARK_NONE;
  return board.marks[board.index(r, c)];
}

export function setMark(board, r, c, mark) {
  if (!inBounds(board, r, c)) return board;
  lanes(board).marks[board.index(r, c)] = mark;
  return board;
}

export function getFuse(board, r, c) {
  if (!board.fuses || !inBounds(board, r, c)) return 0;
  return board.fuses[board.index(r, c)];
}

export function setFuse(board, r, c, fuse) {
  if (!inBounds(board, r, c)) return board;
  lanes(board).fuses[board.index(r, c)] = fuse;
  return board;
}

export function clearMark(board, r, c) {
  setMark(board, r, c, MARK_NONE);
  setFuse(board, r, c, 0);
  return board;
}

/** Every marked tile still on the board, for the UI to decorate. */
export function listMarks(board) {
  if (!board.marks) return [];
  const marked = [];
  for (const tile of listTiles(board)) {
    const mark = getMark(board, tile.r, tile.c);
    if (mark !== MARK_NONE) marked.push({ r: tile.r, c: tile.c, mark, fuse: getFuse(board, tile.r, tile.c) });
  }
  return marked;
}

/**
 * Scatter marks over a freshly dealt board.
 *
 * Counts are clamped to what the board can hold, and the choice is seeded so
 * every player dealt the same board also gets the same specials.
 */
export function sprinkleMarks(board, { seed = 1, gold = 0, ice = 0, bomb = 0, bombFuse = 12, chrono = 0 } = {}) {
  const cells = listTiles(board).map(({ r, c }) => ({ r, c }));
  shuffleInPlace(cells, createRng(seed));

  const placed = { gold: 0, ice: 0, bomb: 0 };
  if (chrono > 0) placed.chrono = 0;
  let i = 0;
  const take = (kind, mark, count, fuse = 0) => {
    for (let n = 0; n < count && i < cells.length; n += 1, i += 1) {
      const { r, c } = cells[i];
      setMark(board, r, c, mark);
      if (fuse) setFuse(board, r, c, fuse);
      if (kind in placed) placed[kind] += 1;
    }
  };

  take('bomb', MARK_BOMB, Math.max(0, Math.trunc(bomb)), Math.max(1, Math.trunc(bombFuse)));
  take('ice', MARK_ICE, Math.max(0, Math.trunc(ice)));
  take('chrono', MARK_CHRONO, Math.max(0, Math.trunc(chrono)));
  take('gold', MARK_GOLD, Math.max(0, Math.trunc(gold)));

  return placed;
}

/**
 * Tick every bomb down one step. Returns the bombs that reached zero — they
 * defuse themselves so a single bomb can never drain the clock twice.
 */
export function tickBombs(board) {
  const exploded = [];
  for (const entry of listMarks(board)) {
    if (entry.mark !== MARK_BOMB) continue;
    const fuse = entry.fuse - 1;
    if (fuse > 0) {
      setFuse(board, entry.r, entry.c, fuse);
    } else {
      clearMark(board, entry.r, entry.c);
      exploded.push({ r: entry.r, c: entry.c });
    }
  }
  return exploded;
}

/**
 * Resolve what a matched pair does to its marks.
 *
 * Iced tiles survive their first match — the ice cracks instead — so the pair
 * is *not* cleared and the caller must leave both tiles standing.
 */
export function resolveMatchMarks(board, a, b) {
  const marks = [getMark(board, a.r, a.c), getMark(board, b.r, b.c)];
  const cracked = [];

  for (const [i, point] of [a, b].entries()) {
    if (marks[i] === MARK_ICE && getTile(board, point.r, point.c) !== EMPTY) {
      clearMark(board, point.r, point.c);
      cracked.push({ r: point.r, c: point.c });
    }
  }

  const hasChrono = marks.includes(MARK_CHRONO);

  return {
    cracked,
    /** The pair stays on the board while any ice is still cracking. */
    survives: cracked.length > 0,
    multiplier: marks.includes(MARK_GOLD) ? GOLD_MULTIPLIER : 1,
    timeGain: hasChrono ? CHRONO_SURGE_SECONDS : 0,
    timeFreeze: hasChrono ? CHRONO_FREEZE_SECONDS : 0,
  };
}
