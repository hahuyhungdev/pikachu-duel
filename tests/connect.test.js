import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid, createBoard, removeTiles, listTiles } from '../src/game/board.js';
import { findPath, findAnyMove, reshuffle, MAX_TURNS } from '../src/game/connect.js';

const at = (r, c) => ({ r, c });

function countTurns(path) {
  let turns = 0;
  for (let i = 1; i < path.length - 1; i += 1) {
    const before = path[i - 1];
    const after = path[i + 1];
    if (before.r !== after.r && before.c !== after.c) turns += 1;
  }
  return turns;
}

test('connects two adjacent identical tiles in a straight line', () => {
  const board = boardFromGrid([[1, 1]]);
  const path = findPath(board, at(1, 1), at(1, 2));
  assert.ok(path, 'expected a path');
  assert.deepEqual(path, [at(1, 1), at(1, 2)]);
  assert.equal(countTurns(path), 0);
});

test('connects two identical tiles down a clear column', () => {
  const board = boardFromGrid([[1], [0], [1]]);
  const path = findPath(board, at(1, 1), at(3, 1));
  assert.ok(path);
  assert.equal(countTurns(path), 0);
});

test('refuses a pair whose straight line is blocked and that has no way round', () => {
  const board = boardFromGrid([
    [9, 9, 9],
    [1, 9, 1],
    [9, 9, 9],
  ]);
  assert.equal(findPath(board, at(2, 1), at(2, 3)), null);
});

test('connects with a single turn around an empty corner', () => {
  const board = boardFromGrid([
    [1, 0],
    [0, 1],
  ]);
  const path = findPath(board, at(1, 1), at(2, 2));
  assert.ok(path);
  assert.equal(countTurns(path), 1);
  assert.equal(path.length, 3);
});

test('refuses a single turn when both corners are occupied', () => {
  const board = boardFromGrid([
    [1, 9, 9],
    [9, 1, 9],
    [9, 9, 9],
  ]);
  assert.equal(findPath(board, at(1, 1), at(2, 2)), null);
});

test('connects with two turns through a clear lane', () => {
  const board = boardFromGrid([
    [1, 9, 9],
    [0, 0, 0],
    [9, 9, 1],
  ]);
  const path = findPath(board, at(1, 1), at(3, 3));
  assert.ok(path);
  assert.equal(countTurns(path), 2);
  assert.equal(path.length, 4);
});

test('routes around the outside of the board when the inside is blocked', () => {
  const board = boardFromGrid([[1, 9, 1]]);
  const path = findPath(board, at(1, 1), at(1, 3));
  assert.ok(path, 'expected a path leaving the board');
  assert.ok(
    path.some((p) => p.r < 1 || p.r > board.rows || p.c < 1 || p.c > board.cols),
    'expected the path to step outside the playable area',
  );
  assert.ok(countTurns(path) <= MAX_TURNS);
});

test('never returns a path with more than two turns', () => {
  const board = createBoard({ rows: 8, cols: 8, iconCount: 14, seed: 4242 });
  const tiles = listTiles(board);
  let checked = 0;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      if (tiles[i].icon !== tiles[j].icon) continue;
      const path = findPath(board, tiles[i], tiles[j]);
      if (!path) continue;
      checked += 1;
      assert.ok(countTurns(path) <= MAX_TURNS, `too many turns: ${JSON.stringify(path)}`);
    }
  }
  assert.ok(checked > 0, 'expected at least one connectable pair to verify');
});

test('rejects tiles with different icons', () => {
  const board = boardFromGrid([[1, 2]]);
  assert.equal(findPath(board, at(1, 1), at(1, 2)), null);
});

test('rejects the same tile selected twice', () => {
  const board = boardFromGrid([[1, 1]]);
  assert.equal(findPath(board, at(1, 1), at(1, 1)), null);
});

test('rejects an already-cleared cell', () => {
  const board = boardFromGrid([[1, 0]]);
  assert.equal(findPath(board, at(1, 1), at(1, 2)), null);
});

test('rejects coordinates outside the playable area', () => {
  const board = boardFromGrid([[1, 1]]);
  assert.equal(findPath(board, at(0, 1), at(1, 2)), null);
  assert.equal(findPath(board, at(1, 1), at(9, 9)), null);
});

test('clearing a blocker opens a new path', () => {
  const board = boardFromGrid([
    [9, 9, 9],
    [1, 9, 1],
    [9, 9, 9],
  ]);
  assert.equal(findPath(board, at(2, 1), at(2, 3)), null);
  removeTiles(board, at(2, 2), at(1, 2));
  const path = findPath(board, at(2, 1), at(2, 3));
  assert.ok(path, 'expected a path once the blocker was cleared');
  assert.equal(countTurns(path), 0);
});

test('findAnyMove returns a playable pair with its path', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const move = findAnyMove(board);
  assert.ok(move, 'expected a move');
  assert.ok(move.path.length >= 2);
  assert.equal(board.cells[board.index(move.a.r, move.a.c)], board.cells[board.index(move.b.r, move.b.c)]);
  assert.ok(findPath(board, move.a, move.b));
});

test('a fully packed diagonal pair with both corners occupied is not playable', () => {
  const board = boardFromGrid([
    [1, 2],
    [2, 1],
  ]);
  assert.equal(findPath(board, at(1, 1), at(2, 2)), null);
  assert.equal(findAnyMove(board), null);
});

test('findAnyMove returns null when every remaining pair is unreachable', () => {
  const board = boardFromGrid([
    [2, 3, 4],
    [1, 5, 1],
    [6, 7, 8],
  ]);
  assert.equal(findAnyMove(board), null);
});

test('findAnyMove returns null on a cleared board', () => {
  const board = boardFromGrid([
    [0, 0],
    [0, 0],
  ]);
  assert.equal(findAnyMove(board), null);
});

test('a freshly generated board always has at least one move', () => {
  for (const seed of [1, 2, 3, 77, 1234, 98765, 20260911]) {
    const board = createBoard({ rows: 8, cols: 8, iconCount: 16, seed });
    assert.ok(findAnyMove(board), `seed ${seed} produced a dead board`);
  }
});

test('reshuffle keeps exactly the same remaining icons', () => {
  const board = createBoard({ rows: 6, cols: 6, iconCount: 9, seed: 31 });
  const before = listTiles(board).map((t) => t.icon).sort((a, b) => a - b);
  reshuffle(board, 555);
  const after = listTiles(board).map((t) => t.icon).sort((a, b) => a - b);
  assert.deepEqual(after, before);
  assert.equal(board.remaining, before.length);
});

test('reshuffle leaves the board with at least one move', () => {
  const board = boardFromGrid([
    [2, 3, 4],
    [1, 5, 1],
    [6, 7, 8],
  ]);
  assert.equal(findAnyMove(board), null);
  reshuffle(board, 1);
  assert.ok(findAnyMove(board), 'reshuffle must guarantee a playable move');
});

test('reshuffle is deterministic for the same seed (fair for both players)', () => {
  const a = createBoard({ rows: 6, cols: 6, iconCount: 9, seed: 8 });
  const b = createBoard({ rows: 6, cols: 6, iconCount: 9, seed: 8 });
  reshuffle(a, 4321);
  reshuffle(b, 4321);
  assert.deepEqual([...a.cells], [...b.cells]);
});

test('reshuffle only moves tiles into cells that were already occupied', () => {
  const board = boardFromGrid([
    [1, 0, 2],
    [0, 1, 0],
    [2, 0, 3],
  ]);
  const occupiedBefore = listTiles(board).map((t) => `${t.r},${t.c}`).sort();
  reshuffle(board, 9);
  const occupiedAfter = listTiles(board).map((t) => `${t.r},${t.c}`).sort();
  assert.deepEqual(occupiedAfter, occupiedBefore);
});
