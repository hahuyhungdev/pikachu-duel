import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid, listTiles } from '../src/game/board.js';
import { findAnyMove } from '../src/game/connect.js';
import { createSession, select, requestHint, requestShuffle } from '../src/game/session.js';

function sessionFromGrid(grid, options = {}) {
  return createSession({ board: boardFromGrid(grid), ...options });
}

test('a new session starts playing with nothing selected', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  assert.equal(session.status, 'playing');
  assert.equal(session.selected, null);
  assert.equal(session.board.remaining, 4);
  assert.equal(session.matchedPairs, 0);
  assert.equal(session.streak, 0);
});

test('selecting a tile marks it as selected', () => {
  const session = sessionFromGrid([[1, 1]]);
  const result = select(session, 1, 1);
  assert.equal(result.type, 'select');
  assert.deepEqual(session.selected, { r: 1, c: 1 });
});

test('selecting the same tile again deselects it', () => {
  const session = sessionFromGrid([[1, 1]]);
  select(session, 1, 1);
  const result = select(session, 1, 1);
  assert.equal(result.type, 'deselect');
  assert.equal(session.selected, null);
});

test('a connectable identical pair is a match and clears both tiles', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  select(session, 1, 1);
  const result = select(session, 1, 2);
  assert.equal(result.type, 'match');
  assert.ok(Array.isArray(result.path) && result.path.length >= 2);
  assert.deepEqual(result.cleared, [{ r: 1, c: 1 }, { r: 1, c: 2 }]);
  assert.equal(session.board.remaining, 2);
  assert.equal(session.matchedPairs, 1);
  assert.equal(session.streak, 1);
  assert.equal(session.selected, null);
});

test('a match increases the score, and consecutive matches score more', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  select(session, 1, 1);
  const first = select(session, 1, 2);
  select(session, 2, 1);
  const second = select(session, 2, 2);
  assert.ok(first.gained > 0);
  assert.ok(second.gained > first.gained, 'a streak should be worth more');
  assert.equal(session.score, first.gained + second.gained);
});

test('picking a different icon reports a mismatch and moves the selection', () => {
  const session = sessionFromGrid([
    [1, 2],
    [2, 1],
  ]);
  select(session, 1, 1);
  const result = select(session, 1, 2);
  assert.equal(result.type, 'mismatch');
  assert.deepEqual(session.selected, { r: 1, c: 2 }, 'the new tile becomes the selection');
  assert.equal(session.board.remaining, 4);
});

test('an identical pair with no legal path reports blocked', () => {
  const session = sessionFromGrid([
    [9, 9, 9],
    [1, 9, 1],
    [9, 9, 9],
  ]);
  select(session, 2, 1);
  const result = select(session, 2, 3);
  assert.equal(result.type, 'blocked');
  assert.deepEqual(result.attempted, [{ r: 2, c: 1 }, { r: 2, c: 3 }]);
  assert.equal(session.board.remaining, 9);
});

test('a failed attempt resets the streak', () => {
  const session = sessionFromGrid([
    [1, 1, 2],
    [3, 2, 3],
  ]);
  select(session, 1, 1);
  select(session, 1, 2);
  assert.equal(session.streak, 1);
  select(session, 1, 3);
  select(session, 2, 1);
  assert.equal(session.streak, 0);
});

test('selecting a cleared or out-of-range cell is invalid', () => {
  const session = sessionFromGrid([[1, 0]]);
  assert.equal(select(session, 1, 2).type, 'invalid');
  assert.equal(select(session, 5, 5).type, 'invalid');
  assert.equal(session.selected, null);
});

test('clearing the last pair wins the game', () => {
  const session = sessionFromGrid([[1, 1]]);
  select(session, 1, 1);
  const result = select(session, 1, 2);
  assert.equal(result.type, 'match');
  assert.equal(result.won, true);
  assert.equal(session.status, 'won');
  assert.equal(session.board.remaining, 0);
});

test('no input is accepted after the game is won', () => {
  const session = sessionFromGrid([[1, 1]]);
  select(session, 1, 1);
  select(session, 1, 2);
  assert.equal(select(session, 1, 1).type, 'invalid');
});

test('requestHint returns a playable move and spends one hint', () => {
  const session = sessionFromGrid([[1, 1]], { hints: 1 });
  const hint = requestHint(session);
  assert.ok(hint);
  assert.deepEqual([hint.a, hint.b].map((p) => `${p.r},${p.c}`).sort(), ['1,1', '1,2']);
  assert.equal(session.hintsLeft, 0);
  assert.equal(requestHint(session), null, 'hints must not go negative');
  assert.equal(session.hintsLeft, 0);
});

test('requestShuffle rearranges the remaining tiles and spends one shuffle', () => {
  const session = sessionFromGrid([
    [2, 3, 4],
    [1, 5, 1],
    [6, 7, 8],
  ], { shuffles: 2, seed: 12 });
  assert.equal(findAnyMove(session.board), null);
  const ok = requestShuffle(session);
  assert.equal(ok, true);
  assert.equal(session.shufflesLeft, 1);
  assert.equal(session.board.remaining, 9);
  assert.ok(findAnyMove(session.board));
});

test('requestShuffle refuses once shuffles run out', () => {
  const session = sessionFromGrid([[1, 1]], { shuffles: 0 });
  assert.equal(requestShuffle(session), false);
  assert.equal(session.shufflesLeft, 0);
});

test('a dead board is auto-shuffled after a match so play can continue', () => {
  // Clearing the 7s strands the two 1s around the fully packed centre.
  const session = sessionFromGrid([
    [7, 7, 2],
    [1, 3, 1],
    [4, 5, 6],
  ], { shuffles: 0, seed: 3 });
  select(session, 1, 1);
  const result = select(session, 1, 2);
  assert.equal(result.type, 'match');
  assert.ok(findAnyMove(session.board), 'the board must never be left unplayable');
  assert.equal(session.board.remaining, 7);
});

test('a whole board can be cleared by repeatedly playing the found move', () => {
  const session = createSession({
    rows: 8,
    cols: 8,
    iconCount: 16,
    seed: 20260911,
    shuffles: Number.POSITIVE_INFINITY,
  });
  let guard = 0;
  while (session.status === 'playing' && guard < 500) {
    guard += 1;
    const move = findAnyMove(session.board);
    if (!move) {
      assert.ok(requestShuffle(session), 'expected a shuffle to be available');
      continue;
    }
    select(session, move.a.r, move.a.c);
    const result = select(session, move.b.r, move.b.c);
    assert.equal(result.type, 'match', `unexpected ${result.type} on a found move`);
  }
  assert.equal(session.status, 'won');
  assert.equal(session.board.remaining, 0);
  assert.equal(session.matchedPairs, 32);
  assert.equal(listTiles(session.board).length, 0);
});

test('createSession builds identical boards for the same seed', () => {
  const a = createSession({ rows: 6, cols: 8, iconCount: 12, seed: 777 });
  const b = createSession({ rows: 6, cols: 8, iconCount: 12, seed: 777 });
  assert.deepEqual([...a.board.cells], [...b.board.cells]);
});
