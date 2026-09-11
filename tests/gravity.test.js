import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid, toGrid } from '../src/game/board.js';
import { GRAVITY_MODES, isGravityMode, applyGravity } from '../src/game/gravity.js';

test('GRAVITY_MODES lists every supported compaction, starting with none', () => {
  assert.equal(GRAVITY_MODES[0], 'none');
  for (const mode of ['down', 'up', 'left', 'right', 'inward-h', 'outward-h', 'inward-v', 'outward-v']) {
    assert.ok(GRAVITY_MODES.includes(mode), `expected ${mode} in GRAVITY_MODES`);
  }
  assert.ok(isGravityMode('down'));
  assert.equal(isGravityMode('sideways'), false);
});

test('gravity "none" leaves the board untouched and reports no moves', () => {
  const board = boardFromGrid([
    [1, 0],
    [0, 2],
  ]);
  const moves = applyGravity(board, 'none');
  assert.deepEqual(moves, []);
  assert.deepEqual(toGrid(board), [
    [1, 0],
    [0, 2],
  ]);
});

test('gravity "down" drops each column to the bottom, keeping column order', () => {
  const board = boardFromGrid([
    [1, 2],
    [0, 0],
    [3, 0],
  ]);
  applyGravity(board, 'down');
  assert.deepEqual(toGrid(board), [
    [0, 0],
    [1, 0],
    [3, 2],
  ]);
});

test('gravity "up" raises each column to the top', () => {
  const board = boardFromGrid([
    [0, 2],
    [0, 0],
    [3, 4],
  ]);
  applyGravity(board, 'up');
  assert.deepEqual(toGrid(board), [
    [3, 2],
    [0, 4],
    [0, 0],
  ]);
});

test('gravity "left" and "right" compact each row horizontally', () => {
  const left = boardFromGrid([[0, 1, 0, 2]]);
  applyGravity(left, 'left');
  assert.deepEqual(toGrid(left), [[1, 2, 0, 0]]);

  const right = boardFromGrid([[0, 1, 0, 2]]);
  applyGravity(right, 'right');
  assert.deepEqual(toGrid(right), [[0, 0, 1, 2]]);
});

test('gravity "inward-h" pulls both halves of a row toward the centre', () => {
  const board = boardFromGrid([[1, 0, 0, 0, 0, 2]]);
  applyGravity(board, 'inward-h');
  assert.deepEqual(toGrid(board), [[0, 0, 1, 2, 0, 0]]);
});

test('gravity "outward-h" pushes both halves of a row toward the edges', () => {
  const board = boardFromGrid([[0, 0, 1, 2, 0, 0]]);
  applyGravity(board, 'outward-h');
  assert.deepEqual(toGrid(board), [[1, 0, 0, 0, 0, 2]]);
});

test('gravity "inward-v" and "outward-v" do the same along columns', () => {
  const inward = boardFromGrid([[1], [0], [0], [2]]);
  applyGravity(inward, 'inward-v');
  assert.deepEqual(toGrid(inward), [[0], [1], [2], [0]]);

  const outward = boardFromGrid([[0], [1], [2], [0]]);
  applyGravity(outward, 'outward-v');
  assert.deepEqual(toGrid(outward), [[1], [0], [0], [2]]);
});

test('gravity never changes how many tiles are left on the board', () => {
  for (const mode of GRAVITY_MODES) {
    const board = boardFromGrid([
      [1, 0, 3],
      [0, 2, 0],
      [4, 0, 5],
    ]);
    const before = board.remaining;
    applyGravity(board, mode);
    assert.equal(board.remaining, before, `${mode} changed remaining`);
    assert.equal(toGrid(board).flat().filter(Boolean).length, before, `${mode} lost or duplicated tiles`);
  }
});

test('applyGravity reports every tile that travelled, so the UI can animate it', () => {
  const board = boardFromGrid([
    [1, 2],
    [0, 0],
    [3, 0],
  ]);
  const moves = applyGravity(board, 'down');
  assert.deepEqual(
    moves.sort((a, b) => a.from.c - b.from.c || a.from.r - b.from.r),
    [
      { from: { r: 1, c: 1 }, to: { r: 2, c: 1 } },
      { from: { r: 1, c: 2 }, to: { r: 3, c: 2 } },
    ],
  );
});

test('gravity carries a tile’s special mark and fuse along with it', async () => {
  const { MARK_ICE, getMark, setMark, getFuse, setFuse } = await import('../src/game/marks.js');
  const board = boardFromGrid([
    [1, 0],
    [0, 0],
  ]);
  setMark(board, 1, 1, MARK_ICE);
  setFuse(board, 1, 1, 4);
  applyGravity(board, 'down');
  assert.equal(getMark(board, 2, 1), MARK_ICE);
  assert.equal(getFuse(board, 2, 1), 4);
  assert.equal(getMark(board, 1, 1), 0);
  assert.equal(getFuse(board, 1, 1), 0);
});

test('an unknown gravity mode is treated as none rather than throwing', () => {
  const board = boardFromGrid([[1, 0]]);
  const moves = applyGravity(board, 'nonsense');
  assert.deepEqual(moves, []);
  assert.deepEqual(toGrid(board), [[1, 0]]);
});
