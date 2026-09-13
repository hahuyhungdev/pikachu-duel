import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid } from '../src/game/board.js';
import { findSmartRobotMove } from '../src/game/bot.ts';
import { MARK_BOMB, MARK_CHRONO } from '../src/game/marks.js';

test('findSmartRobotMove finds legal moves on an ordinary board', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);

  const decision = findSmartRobotMove(board);
  assert.ok(decision);
  assert.equal(decision.reason, 'normal');
  assert.deepEqual(decision.move.a, { r: 1, c: 1 });
  assert.deepEqual(decision.move.b, { r: 1, c: 2 });
});

test('findSmartRobotMove prioritizes defusing low-fuse bombs first', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const stride = board.cols + 2;
  board.marks = new Int32Array(stride * (board.rows + 2));
  board.fuses = new Int32Array(stride * (board.rows + 2));

  // Bomb pair (icon 2 at row 2, col 1) with urgent fuse = 2
  const idxBomb = 2 * stride + 1;
  board.marks[idxBomb] = MARK_BOMB;
  board.fuses[idxBomb] = 2;

  const decision = findSmartRobotMove(board);
  assert.ok(decision);
  assert.equal(decision.reason, 'bomb');
  assert.equal(decision.move.a.r, 2);
});

test('findSmartRobotMove prioritizes chrono over normal pair', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const stride = board.cols + 2;
  board.marks = new Int32Array(stride * (board.rows + 2));

  // Chrono pair (icon 2 at row 2, col 1)
  const idxChrono = 2 * stride + 1;
  board.marks[idxChrono] = MARK_CHRONO;

  const decision = findSmartRobotMove(board);
  assert.ok(decision);
  assert.equal(decision.reason, 'chrono');
  assert.equal(decision.move.a.r, 2);
});
