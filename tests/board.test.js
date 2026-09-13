import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY,
  createBoard,
  boardFromGrid,
  getTile,
  isEmpty,
  listTiles,
  removeTiles,
  cloneBoard,
  toGrid,
} from '../src/game/board.js';

test('createBoard fills every playable cell', () => {
  const board = createBoard({ rows: 6, cols: 8, iconCount: 12, seed: 1 });
  assert.equal(board.rows, 6);
  assert.equal(board.cols, 8);
  assert.equal(board.remaining, 48);
  assert.equal(listTiles(board).length, 48);
});

test('createBoard places every icon an even number of times (board is always solvable-by-count)', () => {
  const board = createBoard({ rows: 8, cols: 8, iconCount: 16, seed: 314 });
  const counts = new Map();
  for (const tile of listTiles(board)) {
    counts.set(tile.icon, (counts.get(tile.icon) ?? 0) + 1);
  }
  assert.ok(counts.size > 1, 'expected more than one icon type');
  for (const [icon, count] of counts) {
    assert.equal(count % 2, 0, `icon ${icon} appears ${count} times`);
  }
});

test('createBoard is identical for the same seed (both players get the same map)', () => {
  const p1 = createBoard({ rows: 6, cols: 8, iconCount: 12, seed: 20260911 });
  const p2 = createBoard({ rows: 6, cols: 8, iconCount: 12, seed: 20260911 });
  assert.deepEqual(toGrid(p1), toGrid(p2));
});

test('createBoard differs for different seeds', () => {
  const a = createBoard({ rows: 6, cols: 8, iconCount: 12, seed: 1 });
  const b = createBoard({ rows: 6, cols: 8, iconCount: 12, seed: 2 });
  assert.notDeepEqual(toGrid(a), toGrid(b));
});

test('createBoard rejects an odd number of cells', () => {
  assert.throws(() => createBoard({ rows: 3, cols: 3, iconCount: 4, seed: 1 }), /even/i);
});

test('createBoard rejects a non-positive icon count', () => {
  assert.throws(() => createBoard({ rows: 4, cols: 4, iconCount: 0, seed: 1 }), /icon/i);
});

test('the border ring around the board reads as empty (paths may leave the board)', () => {
  const board = createBoard({ rows: 4, cols: 4, iconCount: 4, seed: 5 });
  assert.ok(isEmpty(board, 0, 0));
  assert.ok(isEmpty(board, 0, 2));
  assert.ok(isEmpty(board, 5, 2));
  assert.ok(isEmpty(board, 2, 0));
  assert.ok(isEmpty(board, 2, 5));
  assert.ok(!isEmpty(board, 1, 1));
  assert.equal(getTile(board, 0, 0), EMPTY);
});

test('coordinates far outside the padded grid still read as empty', () => {
  const board = createBoard({ rows: 4, cols: 4, iconCount: 4, seed: 5 });
  assert.ok(isEmpty(board, -5, 2));
  assert.ok(isEmpty(board, 2, 99));
  assert.equal(getTile(board, 99, 99), EMPTY);
});

test('removeTiles clears both cells and decrements the remaining count', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  assert.equal(board.remaining, 4);
  removeTiles(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(board.remaining, 2);
  assert.ok(isEmpty(board, 1, 1));
  assert.ok(isEmpty(board, 1, 2));
  assert.ok(!isEmpty(board, 2, 1));
});

test('cloneBoard is an independent copy', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const copy = cloneBoard(board);
  removeTiles(copy, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(board.remaining, 4);
  assert.equal(copy.remaining, 2);
  assert.ok(!isEmpty(board, 1, 1));
});

test('boardFromGrid round-trips through toGrid', () => {
  const grid = [
    [1, 2, 0],
    [0, 2, 1],
  ];
  assert.deepEqual(toGrid(boardFromGrid(grid)), grid);
});

test('createBoard respects custom iconPool when dealing tiles', () => {
  const customPool = [1, 26, 48]; // Pikachu, Charizard, Eevee
  const board = createBoard({ rows: 4, cols: 4, iconCount: 3, iconPool: customPool, seed: 99 });
  const counts = new Map();
  for (const tile of listTiles(board)) counts.set(tile.icon, (counts.get(tile.icon) ?? 0) + 1);
  assert.equal(counts.size, 3);
  assert.ok(counts.has(1));
  assert.ok(counts.has(26));
  assert.ok(counts.has(48));
  for (const count of counts.values()) {
    assert.equal(count % 2, 0);
  }
});

