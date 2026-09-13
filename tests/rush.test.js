import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid } from '../src/game/board.js';
import * as game from '../src/game/session.js';

const make = (rush = true) => game.createSession({
  board: boardFromGrid(Array.from({ length: 12 }, (_, i) => [i + 1, i + 1])),
  rush,
  hints: 0,
});
function match(s, row, now) {
  game.select(s, row, 1, now);
  return game.select(s, row, 2, now);
}

test('Rush requires the next match within five seconds, without penalizing score or mistakes', () => {
  const s = make();
  match(s, 1, 1000);
  match(s, 2, 5999);
  assert.equal(s.streak, 2);
  match(s, 3, 10999);
  assert.equal(s.streak, 1);
  assert.equal(s.mistakes, 0);
  assert.equal(s.score, 325);
});

test('Rush fever starts at five matches and awards only one extra hint per board', () => {
  const s = make();
  for (let row = 1; row <= 5; row++) match(s, row, row * 1000);
  assert.equal(s.fever, true);
  assert.equal(s.hintsLeft, 1);
  for (let row = 6; row <= 10; row++) match(s, row, 20000 + row * 1000);
  assert.equal(s.hintsLeft, 1);
});

test('Classic keeps its untimed combo', () => {
  const s = make(false);
  match(s, 1, 1000);
  match(s, 2, 90000);
  assert.equal(s.streak, 2);
});

test('Rush expires visibly while idle, retaining the selected tile', () => {
  const s = make();
  match(s, 1, 1000);
  game.select(s, 2, 1, 2000);
  assert.equal(typeof game.expireCombo, 'function');
  game.expireCombo(s, 6000);
  assert.equal(s.streak, 0);
  assert.deepEqual(s.selected, { r: 2, c: 1 });
  assert.equal(s.mistakes, 0);
});
