/**
 * Board generation — the public entry point for building a playable layout.
 *
 * Re-exports the grid primitives so callers only need one module.
 */

import { EMPTY, makeBoard, setTile } from './grid.js';
import { findAnyMove, reshuffle } from './connect.js';
import { createRng, shuffleInPlace, deriveSeed } from './rng.js';

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
} from './grid.js';

/**
 * Deal `rows * cols` tiles as matched pairs drawn from `iconCount` kinds.
 * The same seed always produces the same board, and the board is guaranteed to
 * start with at least one playable move.
 */
export function createBoard({ rows, cols, iconCount, seed }) {
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
  const deck = [];
  for (let i = 0; i < pairs; i += 1) {
    const icon = (i % iconCount) + 1;
    deck.push(icon, icon);
  }

  const board = makeBoard(rows, cols);
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
  board.iconCount = iconCount;

  // A packed board can occasionally deal with no legal opening move.
  if (!findAnyMove(board)) reshuffle(board, deriveSeed(seed, 1));

  return board;
}
