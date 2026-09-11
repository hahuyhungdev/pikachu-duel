/**
 * The rule that makes this game Pikachu rather than plain memory matching:
 *
 * two identical tiles may be cleared when a path joins them that
 *   - travels only horizontally and vertically,
 *   - passes only through empty cells (cleared tiles or outside the board), and
 *   - turns at most twice.
 *
 * Because a path may leave the board, any two tiles on the outer ring can
 * always reach each other around the edge.
 */

import { EMPTY, getTile, inBounds, isEmpty, listTiles, setTile } from './grid.js';
import { createRng, shuffleInPlace, deriveSeed } from './rng.js';

export const MAX_TURNS = 2;
const RESHUFFLE_ATTEMPTS = 400;

const samePoint = (a, b) => a.r === b.r && a.c === b.c;

/** Drop repeated points so degenerate candidates collapse to their simplest form. */
function normalize(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (!samePoint(points[i], out[out.length - 1])) out.push(points[i]);
  }
  return out;
}

/** Are all cells strictly between two axis-aligned points empty? */
function clearBetween(board, p, q) {
  if (p.r === q.r) {
    const lo = Math.min(p.c, q.c);
    const hi = Math.max(p.c, q.c);
    for (let c = lo + 1; c < hi; c += 1) {
      if (!isEmpty(board, p.r, c)) return false;
    }
    return true;
  }
  if (p.c === q.c) {
    const lo = Math.min(p.r, q.r);
    const hi = Math.max(p.r, q.r);
    for (let r = lo + 1; r < hi; r += 1) {
      if (!isEmpty(board, r, p.c)) return false;
    }
    return true;
  }
  return false; // not axis-aligned
}

/** A candidate is walkable when every corner is empty and every leg is clear. */
function isWalkable(board, points) {
  for (let i = 1; i < points.length - 1; i += 1) {
    if (!isEmpty(board, points[i].r, points[i].c)) return false;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i];
    const q = points[i + 1];
    if (p.r !== q.r && p.c !== q.c) return false;
    if (!clearBetween(board, p, q)) return false;
  }
  return true;
}

/**
 * The shortest legal path between two tiles, as a list of corner points
 * (including both tiles), or null when they cannot be joined.
 */
export function findPath(board, a, b) {
  if (!a || !b) return null;
  if (!inBounds(board, a.r, a.c) || !inBounds(board, b.r, b.c)) return null;
  if (samePoint(a, b)) return null;

  const icon = getTile(board, a.r, a.c);
  if (icon === EMPTY || icon !== getTile(board, b.r, b.c)) return null;

  // No turns.
  if (a.r === b.r || a.c === b.c) {
    const straight = [a, b];
    if (isWalkable(board, straight)) return straight;
  }

  // One turn, through either corner of the rectangle.
  for (const corner of [{ r: a.r, c: b.c }, { r: b.r, c: a.c }]) {
    const bent = normalize([a, corner, b]);
    if (bent.length === 3 && isWalkable(board, bent)) return bent;
  }

  // Two turns: out along a column lane, then back.
  for (let c = 0; c <= board.cols + 1; c += 1) {
    if (c === a.c || c === b.c) continue; // already covered above
    const lane = normalize([a, { r: a.r, c }, { r: b.r, c }, b]);
    if (lane.length === 4 && isWalkable(board, lane)) return lane;
  }

  // Two turns: out along a row lane, then back.
  for (let r = 0; r <= board.rows + 1; r += 1) {
    if (r === a.r || r === b.r) continue;
    const lane = normalize([a, { r, c: a.c }, { r, c: b.c }, b]);
    if (lane.length === 4 && isWalkable(board, lane)) return lane;
  }

  return null;
}

export function canConnect(board, a, b) {
  return findPath(board, a, b) !== null;
}

/** The first playable pair on the board, used for hints and dead-board checks. */
export function findAnyMove(board) {
  const byIcon = new Map();
  for (const tile of listTiles(board)) {
    const group = byIcon.get(tile.icon);
    if (group) group.push(tile);
    else byIcon.set(tile.icon, [tile]);
  }
  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const path = findPath(board, group[i], group[j]);
        if (path) return { a: { r: group[i].r, c: group[i].c }, b: { r: group[j].r, c: group[j].c }, path };
      }
    }
  }
  return null;
}

/** Every playable pair — used to show how much room the board still has. */
export function countAvailableMoves(board) {
  const byIcon = new Map();
  for (const tile of listTiles(board)) {
    const group = byIcon.get(tile.icon);
    if (group) group.push(tile);
    else byIcon.set(tile.icon, [tile]);
  }
  let total = 0;
  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (findPath(board, group[i], group[j])) total += 1;
      }
    }
  }
  return total;
}

/**
 * Redeal the remaining tiles into the cells they already occupy, retrying until
 * the new arrangement has at least one playable move. Deterministic for a seed,
 * so both players' boards stay in lockstep.
 */
export function reshuffle(board, seed) {
  const tiles = listTiles(board);
  if (tiles.length === 0) return false;

  const positions = tiles.map(({ r, c }) => ({ r, c }));
  const original = tiles.map(({ icon }) => icon);

  for (let attempt = 0; attempt < RESHUFFLE_ATTEMPTS; attempt += 1) {
    const icons = shuffleInPlace([...original], createRng(deriveSeed(seed, attempt + 1)));
    positions.forEach((point, i) => setTile(board, point.r, point.c, icons[i]));
    if (findAnyMove(board)) return true;
  }

  positions.forEach((point, i) => setTile(board, point.r, point.c, original[i]));
  return false;
}
