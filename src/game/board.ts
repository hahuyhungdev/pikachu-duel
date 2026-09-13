/**
 * Board creation and layout initialization.
 *
 * Provides deterministic board generation ensuring all tiles are dealt in pairs,
 * shuffled via PRNG, and verified to contain at least one legal opening move.
 */

import type { Board } from './grid.ts';
import { makeBoard, setTile } from './grid.ts';
import { findAnyMove, reshuffle } from './connect.ts';
import { createRng, deriveSeed, shuffleInPlace } from './rng.ts';

export {
  EMPTY,
  inBounds,
  getTile,
  isEmpty,
  setTile,
  removeTiles,
  listTiles,
  cloneBoard,
  boardFromGrid,
  toGrid,
  makeBoard,
} from './grid.ts';
export type { Board, PlacedTile } from './grid.ts';

/** Configuration options for generating a new board. */
export interface CreateBoardOptions {
  /** Number of playable rows. */
  rows: number;
  /** Number of playable columns. */
  cols: number;
  /** Number of distinct icon types to distribute. */
  iconCount: number;
  /** PRNG seed for deterministic generation. */
  seed: number;
  /** Optional custom icon palette to pick from instead of sequential 1..iconCount. */
  iconPool?: readonly number[];
}

/** Extended Board structure containing generation metadata. */
export interface DealtBoard extends Board {
  seed?: number;
  iconCount?: number;
}

/** Reshuffle seed derivation index for opening moves check. */
const OPENING_RESHUFFLE_STEP = 1;

/**
 * Generates a playable board of dimensions `rows * cols` with tiles paired evenly
 * across `iconCount` distinct icon types, shuffled by `seed`.
 *
 * @param options - Generation options.
 * @returns A freshly allocated and dealt `DealtBoard`.
 * @throws Error if rows/cols are non-positive, if tile count is odd, or if iconCount is invalid.
 */
export function createBoard({ rows, cols, iconCount, seed, iconPool }: CreateBoardOptions): DealtBoard {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error('createBoard: rows and cols must be positive integers');
  }
  if ((rows * cols) % 2 !== 0) {
    throw new Error('createBoard: rows * cols must be even so every tile has a partner');
  }
  if (!Number.isInteger(iconCount) || iconCount < 1) {
    throw new Error('createBoard: iconCount must be at least 1 icon');
  }

  const pairs = (rows * cols) / 2;
  const pool = Array.isArray(iconPool) && iconPool.length > 0 ? iconPool : null;
  const deck: number[] = [];
  for (let i = 0; i < pairs; i += 1) {
    const icon = pool ? pool[i % pool.length] : (i % iconCount) + 1;
    deck.push(icon, icon);
  }

  const board = makeBoard(rows, cols) as DealtBoard;
  shuffleInPlace(deck, createRng(seed));
  let i = 0;
  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      setTile(board, r, c, deck[i]);
      i += 1;
    }
  }
  board.remaining = rows * cols;
  board.seed = seed;
  board.iconCount = pool ? pool.length : iconCount;

  // A freshly dealt board may occasionally have zero legal moves; reshuffle until playable.
  if (!findAnyMove(board)) {
    reshuffle(board, deriveSeed(seed, OPENING_RESHUFFLE_STEP));
  }

  return board;
}
