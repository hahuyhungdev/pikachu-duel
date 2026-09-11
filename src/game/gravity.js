/**
 * Board gravity — the cheapest way to make one stage feel unlike the last.
 *
 * After a pair clears, the surviving tiles slide toward one edge (or toward or
 * away from the middle). The icons never change, but the shape of the board
 * keeps collapsing under the player, so a layout they had already read falls
 * apart and has to be read again. This is the classic Onet variant set.
 */

import { EMPTY, inBounds } from './grid.js';

export const GRAVITY_MODES = [
  'none',
  'down',
  'up',
  'left',
  'right',
  'inward-h',
  'outward-h',
  'inward-v',
  'outward-v',
];

/** Short labels for the HUD, so the player learns what is about to happen. */
export const GRAVITY_LABELS = {
  none: 'Still',
  down: 'Fall',
  up: 'Rise',
  left: 'Drift left',
  right: 'Drift right',
  'inward-h': 'Squeeze in',
  'outward-h': 'Split apart',
  'inward-v': 'Squeeze down',
  'outward-v': 'Split open',
};

export function isGravityMode(mode) {
  return GRAVITY_MODES.includes(mode);
}

/**
 * Collect the cells of one lane in travel order, then repack the tiles at the
 * front of that order. Reversing `cells` before calling is what turns "compact
 * left" into "compact right"; the packing itself never needs to know.
 */
function compactLane(board, cells, moves) {
  const occupied = [];
  for (const cell of cells) {
    const icon = board.cells[board.index(cell.r, cell.c)];
    if (icon !== EMPTY) occupied.push({ ...cell, icon });
  }
  if (occupied.length === cells.length) return;

  const marks = board.marks;
  const fuses = board.fuses;
  const carried = occupied.map((tile) => ({
    ...tile,
    mark: marks ? marks[board.index(tile.r, tile.c)] : 0,
    fuse: fuses ? fuses[board.index(tile.r, tile.c)] : 0,
  }));

  for (const cell of cells) {
    const i = board.index(cell.r, cell.c);
    board.cells[i] = EMPTY;
    if (marks) marks[i] = 0;
    if (fuses) fuses[i] = 0;
  }

  carried.forEach((tile, n) => {
    const target = cells[n];
    const i = board.index(target.r, target.c);
    board.cells[i] = tile.icon;
    if (marks) marks[i] = tile.mark;
    if (fuses) fuses[i] = tile.fuse;
    if (tile.r !== target.r || tile.c !== target.c) {
      moves.push({ from: { r: tile.r, c: tile.c }, to: { r: target.r, c: target.c } });
    }
  });
}

function column(board, c, fromRow, toRow) {
  const cells = [];
  for (let r = fromRow; r <= toRow; r += 1) cells.push({ r, c });
  return cells;
}

function row(board, r, fromCol, toCol) {
  const cells = [];
  for (let c = fromCol; c <= toCol; c += 1) cells.push({ r, c });
  return cells;
}

/** Split a 1..length lane into its two halves, the larger half going first. */
function halves(length) {
  const mid = Math.floor(length / 2);
  return { firstEnd: mid, secondStart: mid + 1 };
}

/**
 * Compact every tile according to `mode`, in place.
 *
 * Returns the list of tiles that actually travelled — `{ from, to }` in board
 * coordinates — so the UI can animate the slide instead of snapping.
 * An unrecognised mode is a no-op rather than an error: stage configs are data,
 * and a typo in data should not end someone's run.
 */
export function applyGravity(board, mode) {
  const moves = [];
  if (!isGravityMode(mode) || mode === 'none') return moves;

  const { rows, cols } = board;

  if (mode === 'down' || mode === 'up') {
    for (let c = 1; c <= cols; c += 1) {
      const lane = column(board, c, 1, rows);
      compactLane(board, mode === 'down' ? lane.reverse() : lane, moves);
    }
  } else if (mode === 'left' || mode === 'right') {
    for (let r = 1; r <= rows; r += 1) {
      const lane = row(board, r, 1, cols);
      compactLane(board, mode === 'right' ? lane.reverse() : lane, moves);
    }
  } else if (mode === 'inward-h' || mode === 'outward-h') {
    const { firstEnd, secondStart } = halves(cols);
    for (let r = 1; r <= rows; r += 1) {
      const left = row(board, r, 1, firstEnd);
      const right = row(board, r, secondStart, cols);
      // Inward packs each half against the middle; outward against the edges.
      compactLane(board, mode === 'inward-h' ? left.reverse() : left, moves);
      compactLane(board, mode === 'inward-h' ? right : right.reverse(), moves);
    }
  } else if (mode === 'inward-v' || mode === 'outward-v') {
    const { firstEnd, secondStart } = halves(rows);
    for (let c = 1; c <= cols; c += 1) {
      const top = column(board, c, 1, firstEnd);
      const bottom = column(board, c, secondStart, rows);
      compactLane(board, mode === 'inward-v' ? top.reverse() : top, moves);
      compactLane(board, mode === 'inward-v' ? bottom : bottom.reverse(), moves);
    }
  }

  return moves;
}

/** Where a tile ended up after `moves`, for callers tracking a selection. */
export function followMoves(point, moves) {
  if (!point) return null;
  const move = moves.find((m) => m.from.r === point.r && m.from.c === point.c);
  return move ? { ...move.to } : { ...point };
}

/** Guard used by the session before trusting a stage's gravity setting. */
export function normalizeGravity(mode) {
  return isGravityMode(mode) ? mode : 'none';
}

export { inBounds };
