/**
 * Pikachu / Onet connection pathfinding and reshuffle mechanics.
 *
 * Core rule: Two identical tiles can be cleared if joined by a path of:
 * 1. Strictly orthogonal (horizontal / vertical) line segments.
 * 2. Cells that are empty (`EMPTY = 0` or outside the playable bounds).
 * 3. At most two 90-degree turns (`MAX_TURNS = 2`).
 *
 * Paths may leave the playable bounds via the padded border ring, allowing
 * outer tiles to connect around the perimeter of the grid.
 */

import type { Point } from '../shared/types/board.types.ts';
import type { Board, PlacedTile } from './grid.ts';
import { EMPTY, getTile, inBounds, isEmpty, listTiles, setTile } from './grid.ts';
import { createRng, deriveSeed, shuffleInPlace } from './rng.ts';

/** Maximum number of 90-degree turns permitted along a connecting path. */
export const MAX_TURNS = 2;

/** Number of points in a zero-turn straight path line segment. */
export const STRAIGHT_SEGMENT_POINTS = 2;

/** Number of corner points in a single-turn path. */
export const ONE_TURN_SEGMENT_POINTS = 3;

/** Number of corner points in a two-turn path. */
export const TWO_TURN_SEGMENT_POINTS = 4;

/** Maximum attempts to find a deterministic reshuffle with valid moves. */
export const MAX_RESHUFFLE_ATTEMPTS = 400;

/** Describes a playable move between two tiles and the path connecting them. */
export interface MoveHint {
  a: Point;
  b: Point;
  path: Point[];
}

/**
 * Checks if two board points have identical row and column coordinates.
 */
function samePoint(a: Point, b: Point): boolean {
  return a.r === b.r && a.c === b.c;
}

/**
 * Collapses duplicate consecutive points in a path sequence.
 *
 * @param points - Array of path coordinates.
 * @returns Deduplicated array of path coordinates.
 */
function normalize(points: Point[]): Point[] {
  if (points.length === 0) return [];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (!samePoint(points[i], out[out.length - 1])) {
      out.push(points[i]);
    }
  }
  return out;
}

/**
 * Tests whether all cells strictly between two axis-aligned points are empty.
 *
 * @param board - Target board.
 * @param p - Start point.
 * @param q - End point.
 * @returns True if points share row or col and all intermediate cells are empty.
 */
function clearBetween(board: Board, p: Point, q: Point): boolean {
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
  return false;
}

/**
 * Checks if a candidate multi-segment path is unobstructed.
 * All intermediate corners and segments must be empty.
 *
 * @param board - Target board.
 * @param points - Corner vertices defining the candidate path.
 * @returns True if path is completely walkable.
 */
function isWalkable(board: Board, points: Point[]): boolean {
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
 * Finds the shortest legal connection path between two tiles with at most 2 turns.
 *
 * @param board - Target board.
 * @param a - Start coordinate.
 * @param b - End coordinate.
 * @returns Array of corner vertices if a path exists, otherwise null.
 */
export function findPath(
  board: Board,
  a: Point | null | undefined,
  b: Point | null | undefined
): Point[] | null {
  if (!a || !b) return null;
  if (!inBounds(board, a.r, a.c) || !inBounds(board, b.r, b.c)) return null;
  if (samePoint(a, b)) return null;

  const icon = getTile(board, a.r, a.c);
  if (icon === EMPTY || icon !== getTile(board, b.r, b.c)) return null;

  // Zero turns: straight horizontal or vertical line segment.
  if (a.r === b.r || a.c === b.c) {
    const straight = [a, b];
    if (isWalkable(board, straight)) return straight;
  }

  // One turn: through either corner of the bounding rectangle.
  for (const corner of [{ r: a.r, c: b.c }, { r: b.r, c: a.c }]) {
    const bent = normalize([a, corner, b]);
    if (bent.length === ONE_TURN_SEGMENT_POINTS && isWalkable(board, bent)) {
      return bent;
    }
  }

  // Two turns: out along a column lane, then transverse, then back.
  for (let c = 0; c <= board.cols + 1; c += 1) {
    if (c === a.c || c === b.c) continue;
    const lane = normalize([a, { r: a.r, c }, { r: b.r, c }, b]);
    if (lane.length === TWO_TURN_SEGMENT_POINTS && isWalkable(board, lane)) {
      return lane;
    }
  }

  // Two turns: out along a row lane, then transverse, then back.
  for (let r = 0; r <= board.rows + 1; r += 1) {
    if (r === a.r || r === b.r) continue;
    const lane = normalize([a, { r, c: a.c }, { r, c: b.c }, b]);
    if (lane.length === TWO_TURN_SEGMENT_POINTS && isWalkable(board, lane)) {
      return lane;
    }
  }

  return null;
}

/**
 * Determines whether two tiles can be legally connected and matched.
 *
 * @param board - Target board.
 * @param a - First tile point.
 * @param b - Second tile point.
 * @returns True if a valid path exists.
 */
export function canConnect(board: Board, a: Point, b: Point): boolean {
  return findPath(board, a, b) !== null;
}

/**
 * Finds the first playable pair on the board.
 * Used for hints, autoplay, and dead-board detection.
 *
 * @param board - Target board.
 * @returns A `MoveHint` descriptor if any valid move exists, or null.
 */
export function findAnyMove(board: Board): MoveHint | null {
  const byIcon = new Map<number, PlacedTile[]>();
  for (const tile of listTiles(board)) {
    const group = byIcon.get(tile.icon);
    if (group) {
      group.push(tile);
    } else {
      byIcon.set(tile.icon, [tile]);
    }
  }

  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const path = findPath(board, group[i], group[j]);
        if (path) {
          return {
            a: { r: group[i].r, c: group[i].c },
            b: { r: group[j].r, c: group[j].c },
            path,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Counts all available playable moves remaining on the board.
 *
 * @param board - Target board.
 * @returns Total count of distinct legal pairs.
 */
export function countAvailableMoves(board: Board): number {
  const byIcon = new Map<number, PlacedTile[]>();
  for (const tile of listTiles(board)) {
    const group = byIcon.get(tile.icon);
    if (group) {
      group.push(tile);
    } else {
      byIcon.set(tile.icon, [tile]);
    }
  }

  let total = 0;
  for (const group of byIcon.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (findPath(board, group[i], group[j])) {
          total += 1;
        }
      }
    }
  }
  return total;
}

/**
 * Deterministically reshuffles surviving tiles into currently occupied cells.
 * Retries until an arrangement with at least one playable move is produced.
 *
 * @param board - Target board to reshuffle.
 * @param seed - PRNG seed ensuring identical reshuffle across players.
 * @returns True if a valid playable configuration was found, false if exhausted.
 */
export function reshuffle(board: Board, seed: number): boolean {
  const tiles = listTiles(board);
  if (tiles.length === 0) return false;

  const positions = tiles.map(({ r, c }) => ({ r, c }));
  const original = tiles.map(({ icon }) => icon);

  for (let attempt = 0; attempt < MAX_RESHUFFLE_ATTEMPTS; attempt += 1) {
    const icons = shuffleInPlace([...original], createRng(deriveSeed(seed, attempt + 1)));
    positions.forEach((point, i) => setTile(board, point.r, point.c, icons[i]));
    if (findAnyMove(board)) return true;
  }

  positions.forEach((point, i) => setTile(board, point.r, point.c, original[i]));
  return false;
}
