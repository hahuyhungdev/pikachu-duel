/**
 * Special-tile marks and hazards (Gold, Ice, Bomb, Chrono).
 *
 * Marks sit atop playable cells, stored in flat buffers aligned with `board.cells`.
 * Special effects:
 * - Gold (MARK_GOLD): 3x score multiplier for matches.
 * - Ice (MARK_ICE): Requires two matches to clear (first match cracks ice).
 * - Bomb (MARK_BOMB): Decrements fuse per move; reaching zero causes clock penalty.
 * - Chrono (MARK_CHRONO): Grants time surge and temporarily freezes the clock.
 */

import type { Point } from '../shared/types/board.types.ts';
import type { Board } from './grid.ts';
import { EMPTY, getTile, inBounds, listTiles } from './grid.ts';
import { createRng, shuffleInPlace } from './rng.ts';

/** No special mark present. */
export const MARK_NONE = 0;

/** Scores triple. Pure upside — incentives hunting specific tile pairs. */
export const MARK_GOLD = 1;

/** Takes two matches to clear: the first match cracks the ice casing. */
export const MARK_ICE = 2;

/** Counts down one step per match; reaching zero penalizes the clock. */
export const MARK_BOMB = 3;

/** Grants clock surge bonus and freezes the timer. */
export const MARK_CHRONO = 4;

/** Penalty in seconds deducted when a bomb detonates. */
export const BOMB_PENALTY_SECONDS = 15;

/** Extra clock time in seconds awarded when matching a Chrono tile. */
export const CHRONO_SURGE_SECONDS = 8;

/** Duration in seconds that the countdown timer is frozen after Chrono match. */
export const CHRONO_FREEZE_SECONDS = 5;

/** Score multiplier applied when either half of a matched pair is gold. */
export const GOLD_MULTIPLIER = 3;

/** Default bomb fuse step count before explosion. */
export const DEFAULT_BOMB_FUSE = 12;

/** Minimum allowed bomb fuse. */
export const MIN_BOMB_FUSE = 1;

/** Default mark placement PRNG seed. */
export const DEFAULT_MARK_SEED = 1;

/** Extended board type containing optional mark and fuse typed arrays. */
export interface BoardWithMarks extends Board {
  marks?: Int32Array;
  fuses?: Int32Array;
}

/** Represents a tile decorated with a special mark. */
export interface MarkedTile {
  r: number;
  c: number;
  mark: number;
  fuse: number;
}

/** Configuration options for scattering special marks across the board. */
export interface SprinkleOptions {
  seed?: number;
  gold?: number;
  ice?: number;
  bomb?: number;
  bombFuse?: number;
  chrono?: number;
}

/** Counts of placed special marks. */
export interface PlacedMarksSummary {
  gold: number;
  ice: number;
  bomb: number;
  chrono?: number;
  [key: string]: number | undefined;
}

/** Result of resolving special marks when a pair of tiles is matched. */
export interface MatchMarksResolution {
  /** Coordinates where ice was cracked. */
  cracked: Point[];
  /** Whether the tiles remain on the board (e.g. cracked ice survives). */
  survives: boolean;
  /** Score multiplier (3x if gold, else 1x). */
  multiplier: number;
  /** Clock seconds added (Chrono surge). */
  timeGain: number;
  /** Clock freeze duration in seconds. */
  timeFreeze: number;
}

/**
 * Ensures the board has initialized typed arrays for marks and fuses.
 */
function lanes(board: BoardWithMarks): Required<Pick<BoardWithMarks, 'marks' | 'fuses'>> {
  if (!board.marks) {
    board.marks = new Int32Array(board.cells.length);
  }
  if (!board.fuses) {
    board.fuses = new Int32Array(board.cells.length);
  }
  return board as Required<Pick<BoardWithMarks, 'marks' | 'fuses'>>;
}

/**
 * Retrieves the special mark at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @returns Mark constant, or `MARK_NONE`.
 */
export function getMark(board: BoardWithMarks, r: number, c: number): number {
  if (!board.marks || !inBounds(board, r, c)) return MARK_NONE;
  return board.marks[board.index(r, c)];
}

/**
 * Sets a special mark at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @param mark - Mark constant to set.
 * @returns Mutated board.
 */
export function setMark(board: BoardWithMarks, r: number, c: number, mark: number): BoardWithMarks {
  if (!inBounds(board, r, c)) return board;
  lanes(board).marks[board.index(r, c)] = mark;
  return board;
}

/**
 * Retrieves the remaining fuse counter at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @returns Fuse count, or 0.
 */
export function getFuse(board: BoardWithMarks, r: number, c: number): number {
  if (!board.fuses || !inBounds(board, r, c)) return 0;
  return board.fuses[board.index(r, c)];
}

/**
 * Sets the fuse counter at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @param fuse - Steps remaining.
 * @returns Mutated board.
 */
export function setFuse(board: BoardWithMarks, r: number, c: number, fuse: number): BoardWithMarks {
  if (!inBounds(board, r, c)) return board;
  lanes(board).fuses[board.index(r, c)] = fuse;
  return board;
}

/**
 * Clears both the mark and the fuse at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @returns Mutated board.
 */
export function clearMark(board: BoardWithMarks, r: number, c: number): BoardWithMarks {
  setMark(board, r, c, MARK_NONE);
  setFuse(board, r, c, 0);
  return board;
}

/**
 * Lists all active marked tiles on the board.
 *
 * @param board - Target board.
 * @returns Array of marked tile descriptors.
 */
export function listMarks(board: BoardWithMarks): MarkedTile[] {
  if (!board.marks) return [];
  const marked: MarkedTile[] = [];
  for (const tile of listTiles(board)) {
    const mark = getMark(board, tile.r, tile.c);
    if (mark !== MARK_NONE) {
      marked.push({
        r: tile.r,
        c: tile.c,
        mark,
        fuse: getFuse(board, tile.r, tile.c),
      });
    }
  }
  return marked;
}

/**
 * Deterministically distributes special marks across an initial board deal.
 *
 * @param board - Freshly dealt board.
 * @param options - Mark counts and seed parameters.
 * @returns Summary of placed marks.
 */
export function sprinkleMarks(
  board: BoardWithMarks,
  {
    seed = DEFAULT_MARK_SEED,
    gold = 0,
    ice = 0,
    bomb = 0,
    bombFuse = DEFAULT_BOMB_FUSE,
    chrono = 0,
  }: SprinkleOptions = {}
): PlacedMarksSummary {
  const cells = listTiles(board).map(({ r, c }) => ({ r, c }));
  shuffleInPlace(cells, createRng(seed));

  const placed: PlacedMarksSummary = { gold: 0, ice: 0, bomb: 0 };
  if (chrono > 0) {
    placed.chrono = 0;
  }
  let i = 0;

  const take = (kind: string, mark: number, count: number, fuse: number = 0): void => {
    for (let n = 0; n < count && i < cells.length; n += 1, i += 1) {
      const { r, c } = cells[i];
      setMark(board, r, c, mark);
      if (fuse > 0) {
        setFuse(board, r, c, fuse);
      }
      if (kind in placed) {
        placed[kind] = (placed[kind] || 0) + 1;
      }
    }
  };

  take('bomb', MARK_BOMB, Math.max(0, Math.trunc(bomb)), Math.max(MIN_BOMB_FUSE, Math.trunc(bombFuse)));
  take('ice', MARK_ICE, Math.max(0, Math.trunc(ice)));
  take('chrono', MARK_CHRONO, Math.max(0, Math.trunc(chrono)));
  take('gold', MARK_GOLD, Math.max(0, Math.trunc(gold)));

  return placed;
}

/**
 * Decrements fuse for all active bombs by 1.
 * Detonated bombs (fuse <= 0) are cleared and returned for penalty application.
 *
 * @param board - Target board.
 * @returns Array of exploded bomb point coordinates.
 */
export function tickBombs(board: BoardWithMarks): Point[] {
  const exploded: Point[] = [];
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
 * Resolves the mechanical consequences of matching two marked tiles.
 *
 * @param board - Target board.
 * @param a - First matched point.
 * @param b - Second matched point.
 * @returns Resolution details including cracked ice, multiplier, and time bonuses.
 */
export function resolveMatchMarks(board: BoardWithMarks, a: Point, b: Point): MatchMarksResolution {
  const marks = [getMark(board, a.r, a.c), getMark(board, b.r, b.c)];
  const cracked: Point[] = [];

  for (const [i, point] of [a, b].entries()) {
    if (marks[i] === MARK_ICE && getTile(board, point.r, point.c) !== EMPTY) {
      clearMark(board, point.r, point.c);
      cracked.push({ r: point.r, c: point.c });
    }
  }

  const hasChrono = marks.includes(MARK_CHRONO);

  return {
    cracked,
    survives: cracked.length > 0,
    multiplier: marks.includes(MARK_GOLD) ? GOLD_MULTIPLIER : 1,
    timeGain: hasChrono ? CHRONO_SURGE_SECONDS : 0,
    timeFreeze: hasChrono ? CHRONO_FREEZE_SECONDS : 0,
  };
}
