import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid, getTile, toGrid, EMPTY } from '../src/game/board.js';
import { MARK_BOMB, MARK_GOLD, MARK_ICE, getMark, listMarks, setFuse, setMark } from '../src/game/marks.js';
import { BOMB_PENALTY_SECONDS, GOLD_MULTIPLIER } from '../src/game/marks.js';
import {
  MATCH_SCORE,
  STREAK_BONUS,
  FEVER_STREAK,
  FEVER_MULTIPLIER,
  comboTier,
  createSession,
  select,
} from '../src/game/session.js';

/** A 1×2 board of one matching pair — the smallest possible match. */
const pairGrid = () => [[1, 1]];

function sessionFromGrid(grid, options = {}) {
  return createSession({ board: boardFromGrid(grid), ...options });
}

/** Clears one horizontal pair at (r,c1)-(r,c2). */
function matchAt(session, r, c1, c2) {
  select(session, r, c1);
  return select(session, r, c2);
}

test('comboTier climbs through four bands and tops out at fever', () => {
  assert.equal(comboTier(0), 0);
  assert.equal(comboTier(1), 0);
  assert.equal(comboTier(3), 1);
  assert.equal(comboTier(5), 2);
  assert.equal(comboTier(FEVER_STREAK), 3);
  assert.equal(comboTier(FEVER_STREAK + 50), 3, 'tier 3 is the ceiling');
});

test('a fresh session is out of fever with no combo', () => {
  const session = sessionFromGrid(pairGrid());
  assert.equal(session.streak, 0);
  assert.equal(session.tier, 0);
  assert.equal(session.fever, false);
});

test('every match reports the combo tier and fever state it produced', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const result = matchAt(session, 1, 1, 2);
  assert.equal(result.type, 'match');
  assert.equal(result.tier, comboTier(1));
  assert.equal(result.fever, false);
  assert.equal(session.tier, result.tier);
});

test('holding a long streak turns fever on, and a miss turns it straight off', () => {
  // The last row deliberately holds two *different* icons, so it is a miss.
  const rows = Array.from({ length: FEVER_STREAK }, (_, i) => [i + 1, i + 1]);
  rows.push([20, 21]);
  const session = sessionFromGrid(rows);

  let last;
  for (let r = 1; r <= FEVER_STREAK; r += 1) last = matchAt(session, r, 1, 2);

  assert.equal(session.streak, FEVER_STREAK);
  assert.equal(last.fever, true);
  assert.equal(session.fever, true);

  select(session, FEVER_STREAK + 1, 1);
  const miss = select(session, FEVER_STREAK + 1, 2);
  assert.equal(miss.type, 'mismatch');
  assert.equal(session.streak, 0);
  assert.equal(session.fever, false);
  assert.equal(session.tier, 0);
});

test('fever multiplies the score on top of the existing streak bonus', () => {
  const rows = Array.from({ length: FEVER_STREAK }, (_, i) => [i + 1, i + 1]);
  const session = sessionFromGrid(rows);

  let feverMatch;
  for (let r = 1; r <= FEVER_STREAK; r += 1) feverMatch = matchAt(session, r, 1, 2);

  const baseAtFever = MATCH_SCORE + (FEVER_STREAK - 1) * STREAK_BONUS;
  assert.equal(feverMatch.gained, baseAtFever * FEVER_MULTIPLIER);
});

test('a gold tile triples that single match without touching the streak', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  setMark(session.board, 1, 1, MARK_GOLD);

  const result = matchAt(session, 1, 1, 2);
  assert.equal(result.multiplier, GOLD_MULTIPLIER);
  assert.equal(result.gained, MATCH_SCORE * GOLD_MULTIPLIER);
  assert.equal(session.streak, 1);
});

test('an iced pair cracks on the first match and clears on the second', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  setMark(session.board, 1, 1, MARK_ICE);

  const first = matchAt(session, 1, 1, 2);
  assert.equal(first.type, 'crack');
  assert.equal(first.won, false);
  assert.deepEqual(first.cracked, [{ r: 1, c: 1 }]);
  assert.notEqual(getTile(session.board, 1, 1), EMPTY, 'an iced tile must survive its first match');
  assert.equal(session.board.remaining, 4);
  assert.equal(session.streak, 1, 'cracking ice is still good play');
  assert.equal(getMark(session.board, 1, 1), 0);
  assert.equal(session.selected, null, 'the cracked pair must not stay selected');

  const second = matchAt(session, 1, 1, 2);
  assert.equal(second.type, 'match');
  assert.equal(session.board.remaining, 2);
});

test('a crack scores less than a clean clear, so ice is a real cost', () => {
  const iced = sessionFromGrid([[1, 1], [2, 2]]);
  setMark(iced.board, 1, 1, MARK_ICE);
  const crack = matchAt(iced, 1, 1, 2);

  const plain = sessionFromGrid([[1, 1], [2, 2]]);
  const clear = matchAt(plain, 1, 1, 2);

  assert.ok(crack.gained < clear.gained, 'cracking must pay less than clearing');
  assert.ok(crack.gained > 0, 'cracking must still pay something');
});

test('every successful match burns one step off every bomb fuse', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  setMark(session.board, 2, 1, MARK_BOMB);
  setFuse(session.board, 2, 1, 3);

  matchAt(session, 1, 1, 2);
  assert.equal(listMarks(session.board)[0].fuse, 2);
});

test('a bomb running out costs clock time and reports itself once', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  setMark(session.board, 2, 1, MARK_BOMB);
  setFuse(session.board, 2, 1, 1);

  const result = matchAt(session, 1, 1, 2);
  assert.deepEqual(result.exploded, [{ r: 2, c: 1 }]);
  assert.equal(result.timeDelta, -BOMB_PENALTY_SECONDS);
  assert.equal(listMarks(session.board).length, 0, 'the bomb must defuse after going off');
});

test('a Time Attack session pays clock time for a match, and more in fever', () => {
  const rows = Array.from({ length: FEVER_STREAK }, (_, i) => [i + 1, i + 1]);
  const session = createSession({
    board: boardFromGrid(rows),
    timeGain: { match: 2, fever: 5 },
  });

  const first = matchAt(session, 1, 1, 2);
  assert.equal(first.timeDelta, 2);

  let last;
  for (let r = 2; r <= FEVER_STREAK; r += 1) last = matchAt(session, r, 1, 2);
  assert.equal(last.fever, true);
  assert.equal(last.timeDelta, 5, 'fever pays the higher rate');
});

test('a session with no time rules never reports a time change', () => {
  const session = sessionFromGrid([[1, 1], [2, 2]]);
  assert.equal(matchAt(session, 1, 1, 2).timeDelta, 0);
});

test('gravity pulls the surviving tiles in after a clear and reports the slide', () => {
  const session = createSession({
    board: boardFromGrid([
      [3, 4],
      [1, 1],
      [3, 4],
    ]),
    gravity: 'down',
  });

  const result = matchAt(session, 2, 1, 2);
  assert.equal(result.type, 'match');
  assert.ok(result.moves.length > 0, 'tiles above the gap must fall');
  assert.deepEqual(toGrid(session.board), [
    [0, 0],
    [3, 4],
    [3, 4],
  ]);
});

test('a session with no gravity leaves the holes exactly where they were', () => {
  const session = sessionFromGrid([
    [3, 4],
    [1, 1],
    [3, 4],
  ]);
  const result = matchAt(session, 2, 1, 2);
  assert.deepEqual(result.moves, []);
  assert.deepEqual(toGrid(session.board), [
    [3, 4],
    [0, 0],
    [3, 4],
  ]);
});

test('gravity carries a special mark along with the tile it sits on', () => {
  const session = createSession({
    board: boardFromGrid([
      [3, 4],
      [1, 1],
      [3, 4],
    ]),
    gravity: 'down',
  });
  setMark(session.board, 1, 1, MARK_GOLD);

  matchAt(session, 2, 1, 2);
  assert.equal(getMark(session.board, 2, 1), MARK_GOLD, 'the gold tile must fall with its tile');
});

test('clearing the last pair still wins even with gravity switched on', () => {
  const session = createSession({ board: boardFromGrid(pairGrid()), gravity: 'down' });
  const result = matchAt(session, 1, 1, 2);
  assert.equal(result.won, true);
  assert.equal(session.status, 'won');
});

test('createSession scatters the specials it was asked for, seeded', () => {
  const make = () =>
    createSession({ rows: 6, cols: 6, iconCount: 8, seed: 11, gold: 2, ice: 2, bomb: 1, bombFuse: 8 });
  const a = make();
  const b = make();
  assert.equal(listMarks(a.board).length, 5);
  assert.deepEqual(listMarks(a.board), listMarks(b.board), 'the same seed must place the same specials');
});

test('the existing plain-session behaviour is unchanged', () => {
  const session = sessionFromGrid([
    [1, 1],
    [2, 2],
  ]);
  assert.equal(session.gravity, 'none');
  const result = matchAt(session, 1, 1, 2);
  assert.equal(result.gained, MATCH_SCORE);
  assert.equal(result.multiplier, 1);
  assert.deepEqual(result.cracked, []);
  assert.deepEqual(result.exploded, []);
});
