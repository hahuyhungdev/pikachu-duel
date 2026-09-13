/**
 * Board gravity mechanics and tile compaction.
 *
 * After matched pairs are removed, surviving tiles can slide along directional
 * lanes (down, up, left, right, inward, or outward). This continually shifts the
 * board topology, presenting fresh paths and challenging player spatial memory.
 */

import type { Point } from '../shared/types/board.types.ts';
import { EMPTY, inBounds } from './grid.ts';
import type { BoardWithMarks } from './marks.ts';

/** Supported board gravity movement patterns. */
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
] as const;

/** Union type of all valid gravity mode identifiers. */
export type GravityMode = (typeof GRAVITY_MODES)[number];

/** Human-readable HUD labels describing active board gravity. */
export const GRAVITY_LABELS: Record<GravityMode, string> = {
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

/**
 * Validates whether a value is a recognised `GravityMode`.
 *
 * @param mode - The string value to test.
 * @returns True if `mode` is one of `GRAVITY_MODES`.
 */
export function isGravityMode(mode: unknown): mode is GravityMode {
  return typeof mode === 'string' && (GRAVITY_MODES as readonly string[]).includes(mode);
}

/** Describes the spatial translation of a tile resulting from gravity. */
export interface GravityMove {
  from: Point;
  to: Point;
}

/** Occupied tile descriptor before compaction. */
interface LaneTile extends Point {
  icon: number;
}

/** Tile with marks and fuses preserved across gravity movement. */
interface CarriedTile extends LaneTile {
  mark: number;
  fuse: number;
}

/**
 * Compacts the tiles in a specified lane order towards the front of `cells`.
 * Preserves tile icons, marks, and bomb fuse timers.
 *
 * @param board - Target board.
 * @param cells - Array of cell coordinates in order of travel.
 * @param moves - Collector for emitted tile movements.
 */
function compactLane(board: BoardWithMarks, cells: Point[], moves: GravityMove[]): void {
  const occupied: LaneTile[] = [];
  for (const cell of cells) {
    const icon = board.cells[board.index(cell.r, cell.c)];
    if (icon !== EMPTY) {
      occupied.push({ ...cell, icon });
    }
  }
  if (occupied.length === cells.length) return;

  const marks = board.marks;
  const fuses = board.fuses;
  const carried: CarriedTile[] = occupied.map((tile) => ({
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
      moves.push({
        from: { r: tile.r, c: tile.c },
        to: { r: target.r, c: target.c },
      });
    }
  });
}

/**
 * Generates cell coordinates for a column segment [fromRow, toRow].
 */
function column(c: number, fromRow: number, toRow: number): Point[] {
  const cells: Point[] = [];
  for (let r = fromRow; r <= toRow; r += 1) {
    cells.push({ r, c });
  }
  return cells;
}

/**
 * Generates cell coordinates for a row segment [fromCol, toCol].
 */
function row(r: number, fromCol: number, toCol: number): Point[] {
  const cells: Point[] = [];
  for (let c = fromCol; c <= toCol; c += 1) {
    cells.push({ r, c });
  }
  return cells;
}

/**
 * Splits a 1-based length into its two halves.
 */
function halves(length: number): { firstEnd: number; secondStart: number } {
  const mid = Math.floor(length / 2);
  return { firstEnd: mid, secondStart: mid + 1 };
}

/**
 * Applies directional gravity to all tiles on the board in-place.
 *
 * @param board - Target board.
 * @param mode - The gravity direction or pattern.
 * @returns Array of tile movements for UI animation and selection tracking.
 */
export function applyGravity(board: BoardWithMarks, mode: string): GravityMove[] {
  const moves: GravityMove[] = [];
  if (!isGravityMode(mode) || mode === 'none') return moves;

  const { rows, cols } = board;

  if (mode === 'down' || mode === 'up') {
    for (let c = 1; c <= cols; c += 1) {
      const lane = column(c, 1, rows);
      compactLane(board, mode === 'down' ? lane.reverse() : lane, moves);
    }
  } else if (mode === 'left' || mode === 'right') {
    for (let r = 1; r <= rows; r += 1) {
      const lane = row(r, 1, cols);
      compactLane(board, mode === 'right' ? lane.reverse() : lane, moves);
    }
  } else if (mode === 'inward-h' || mode === 'outward-h') {
    const { firstEnd, secondStart } = halves(cols);
    for (let r = 1; r <= rows; r += 1) {
      const left = row(r, 1, firstEnd);
      const right = row(r, secondStart, cols);
      compactLane(board, mode === 'inward-h' ? left.reverse() : left, moves);
      compactLane(board, mode === 'inward-h' ? right : right.reverse(), moves);
    }
  } else if (mode === 'inward-v' || mode === 'outward-v') {
    const { firstEnd, secondStart } = halves(rows);
    for (let c = 1; c <= cols; c += 1) {
      const top = column(c, 1, firstEnd);
      const bottom = column(c, secondStart, rows);
      compactLane(board, mode === 'inward-v' ? top.reverse() : top, moves);
      compactLane(board, mode === 'inward-v' ? bottom : bottom.reverse(), moves);
    }
  }

  return moves;
}

/**
 * Computes the updated coordinate of a selected point following gravity translation.
 *
 * @param point - The original point.
 * @param moves - List of executed gravity moves.
 * @returns The destination point, original point if stationary, or null if input was null.
 */
export function followMoves(point: Point | null, moves: GravityMove[]): Point | null {
  if (!point) return null;
  const move = moves.find((m) => m.from.r === point.r && m.from.c === point.c);
  return move ? { ...move.to } : { ...point };
}

/**
 * Normalizes an unknown gravity string, falling back to `'none'`.
 *
 * @param mode - Input gravity string.
 * @returns A guaranteed valid `GravityMode`.
 */
export function normalizeGravity(mode: unknown): GravityMode {
  return isGravityMode(mode) ? mode : 'none';
}

export { inBounds };
