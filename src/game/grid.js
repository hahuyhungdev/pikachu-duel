/**
 * The grid primitives.
 *
 * Cells are stored in a flat array padded with a one-cell ring of permanently
 * empty border cells, so a connecting path is allowed to leave the playable
 * area and come back — exactly like the original Pikachu / Onet games. Playable
 * coordinates are 1-based: rows 1..rows, columns 1..cols.
 */

export const EMPTY = 0;

function attachIndex(board) {
  const { stride } = board;
  board.index = (r, c) => r * stride + c;
  return board;
}

export function makeBoard(rows, cols) {
  const stride = cols + 2;
  return attachIndex({
    rows,
    cols,
    stride,
    cells: new Int32Array(stride * (rows + 2)),
    remaining: 0,
  });
}

/** Is (r, c) a real, playable coordinate? */
export function inBounds(board, r, c) {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 1 && r <= board.rows && c >= 1 && c <= board.cols;
}

/** Icon at (r, c), or EMPTY for cleared, border and off-grid cells. */
export function getTile(board, r, c) {
  if (!Number.isInteger(r) || !Number.isInteger(c)) return EMPTY;
  if (r < 0 || r > board.rows + 1 || c < 0 || c > board.cols + 1) return EMPTY;
  return board.cells[board.index(r, c)];
}

export function isEmpty(board, r, c) {
  return getTile(board, r, c) === EMPTY;
}

export function setTile(board, r, c, icon) {
  board.cells[board.index(r, c)] = icon;
}

/** Clear a matched pair. */
export function removeTiles(board, a, b) {
  for (const point of [a, b]) {
    if (inBounds(board, point.r, point.c) && !isEmpty(board, point.r, point.c)) {
      setTile(board, point.r, point.c, EMPTY);
      board.remaining -= 1;
    }
  }
  return board;
}

/** Every tile still on the board, in row-major order. */
export function listTiles(board) {
  const tiles = [];
  for (let r = 1; r <= board.rows; r += 1) {
    for (let c = 1; c <= board.cols; c += 1) {
      const icon = board.cells[board.index(r, c)];
      if (icon !== EMPTY) tiles.push({ r, c, icon });
    }
  }
  return tiles;
}

export function cloneBoard(board) {
  return attachIndex({
    rows: board.rows,
    cols: board.cols,
    stride: board.stride,
    cells: board.cells.slice(),
    remaining: board.remaining,
  });
}

/** Build a board from a literal 2-D layout (0 = empty). Handy for tests. */
export function boardFromGrid(grid) {
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

export function toGrid(board) {
  const grid = [];
  for (let r = 1; r <= board.rows; r += 1) {
    const row = [];
    for (let c = 1; c <= board.cols; c += 1) row.push(board.cells[board.index(r, c)]);
    grid.push(row);
  }
  return grid;
}
