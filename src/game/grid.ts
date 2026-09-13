/**
 * The grid primitives and 2D-to-1D board memory indexing.
 *
 * Cells are stored in a flat TypedArray padded with a 1-cell ring of permanently
 * empty border cells. This allows connecting paths to leave the playable grid and
 * wrap around the outside perimeter, mirroring classic Onet / Pikachu mechanics.
 * Playable coordinates are 1-based: row in [1, rows], col in [1, cols].
 */

import type { Point } from '../shared/types/board.types.ts';

/** Empty cell identifier representing cleared or vacant board positions. */
export const EMPTY = 0;

/** Ring padding thickness on each side of the board for path wrap-around. */
export const BORDER_PADDING = 1;

/** Total extra cells added per axis (1 before, 1 after). */
export const PADDING_TOTAL_EXTRA = 2;

/**
 * Representation of the in-memory flat grid board structure.
 */
export interface Board {
  /** Number of playable rows (excluding padding). */
  rows: number;
  /** Number of playable columns (excluding padding). */
  cols: number;
  /** Row stride in the 1D cells buffer (cols + 2). */
  stride: number;
  /** Flat Int32Array containing cell values (0 = empty, > 0 = icon id). */
  cells: Int32Array;
  /** Count of non-empty tiles remaining on the board. */
  remaining: number;
  /** Calculates the 1D flat buffer index for (r, c). */
  index: (r: number, c: number) => number;
}

/** Represents a placed tile on the board with coordinates and icon ID. */
export interface PlacedTile {
  r: number;
  c: number;
  icon: number;
}

/**
 * Attaches the flat index computation closure to a board object.
 *
 * @param board - Board object containing `stride`.
 * @returns The board augmented with `index(r, c)`.
 */
function attachIndex(board: Omit<Board, 'index'>): Board {
  const { stride } = board;
  const boardWithIndex = board as Board;
  boardWithIndex.index = (r: number, c: number): number => r * stride + c;
  return boardWithIndex;
}

/**
 * Allocates a new blank board with border padding.
 *
 * @param rows - Number of playable rows.
 * @param cols - Number of playable columns.
 * @returns An initialized `Board` with all cells set to `EMPTY`.
 */
export function makeBoard(rows: number, cols: number): Board {
  const stride = cols + PADDING_TOTAL_EXTRA;
  const totalBufferSize = stride * (rows + PADDING_TOTAL_EXTRA);
  return attachIndex({
    rows,
    cols,
    stride,
    cells: new Int32Array(totalBufferSize),
    remaining: 0,
  });
}

/**
 * Checks if (r, c) falls strictly inside the playable bounds.
 *
 * @param board - The board to check against.
 * @param r - Row index.
 * @param c - Column index.
 * @returns True if (r, c) is an integer within [1, rows] and [1, cols].
 */
export function inBounds(board: Pick<Board, 'rows' | 'cols'>, r: number, c: number): boolean {
  return (
    Number.isInteger(r) &&
    Number.isInteger(c) &&
    r >= 1 &&
    r <= board.rows &&
    c >= 1 &&
    c <= board.cols
  );
}

/**
 * Retrieves the icon ID at (r, c), or `EMPTY` for cleared, border, or out-of-range cells.
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @returns The icon ID or `EMPTY` (0).
 */
export function getTile(board: Board, r: number, c: number): number {
  if (!Number.isInteger(r) || !Number.isInteger(c)) return EMPTY;
  if (r < 0 || r > board.rows + BORDER_PADDING || c < 0 || c > board.cols + BORDER_PADDING) {
    return EMPTY;
  }
  return board.cells[board.index(r, c)];
}

/**
 * Checks if a cell at (r, c) is empty.
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @returns True if cell contains `EMPTY` (0).
 */
export function isEmpty(board: Board, r: number, c: number): boolean {
  return getTile(board, r, c) === EMPTY;
}

/**
 * Mutates the tile value at (r, c).
 *
 * @param board - Target board.
 * @param r - Row index.
 * @param c - Column index.
 * @param icon - The icon ID to place.
 */
export function setTile(board: Board, r: number, c: number, icon: number): void {
  board.cells[board.index(r, c)] = icon;
}

/**
 * Clears a matched pair of points from the board and decrements `remaining`.
 *
 * @param board - Target board.
 * @param a - First point coordinate.
 * @param b - Second point coordinate.
 * @returns The mutated board.
 */
export function removeTiles(board: Board, a: Point, b: Point): Board {
  for (const point of [a, b]) {
    if (inBounds(board, point.r, point.c) && !isEmpty(board, point.r, point.c)) {
      setTile(board, point.r, point.c, EMPTY);
      board.remaining -= 1;
    }
  }
  return board;
}

/**
 * Lists all non-empty tiles currently on the board in row-major order.
 *
 * @param board - Target board.
 * @returns An array of `{ r, c, icon }` descriptors.
 */
export function listTiles(board: Board): PlacedTile[] {
  const tiles: PlacedTile[] = [];
  for (let r = 1; r <= board.rows; r += 1) {
    for (let c = 1; c <= board.cols; c += 1) {
      const icon = board.cells[board.index(r, c)];
      if (icon !== EMPTY) {
        tiles.push({ r, c, icon });
      }
    }
  }
  return tiles;
}

/**
 * Deep copies a board and its underlying cell buffer.
 *
 * @param board - Board to clone.
 * @returns A fresh `Board` with copied buffer state.
 */
export function cloneBoard(board: Board): Board {
  return attachIndex({
    rows: board.rows,
    cols: board.cols,
    stride: board.stride,
    cells: board.cells.slice(),
    remaining: board.remaining,
  });
}

/**
 * Constructs a board from a 2D matrix of numbers (0 = empty).
 * Useful for deterministic tests and test fixtures.
 *
 * @param grid - 2D nested array representing rows of icon values.
 * @returns A fully initialized `Board`.
 */
export function boardFromGrid(grid: number[][]): Board {
  const rows = grid.length;
  const cols = rows === 0 ? 0 : grid[0].length;
  const board = makeBoard(rows, cols);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const icon = grid[r][c];
      if (icon !== EMPTY) {
        setTile(board, r + 1, c + 1, icon);
        board.remaining += 1;
      }
    }
  }
  return board;
}

/**
 * Serializes a board's playable area into a 2D array for debugging or comparisons.
 *
 * @param board - Target board.
 * @returns 2D array representation.
 */
export function toGrid(board: Board): number[][] {
  const grid: number[][] = [];
  for (let r = 1; r <= board.rows; r += 1) {
    const row: number[] = [];
    for (let c = 1; c <= board.cols; c += 1) {
      row.push(board.cells[board.index(r, c)]);
    }
    grid.push(row);
  }
  return grid;
}
