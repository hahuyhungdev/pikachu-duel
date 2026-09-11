import test from 'node:test';
import assert from 'node:assert/strict';
import { boardFromGrid, createBoard, listTiles, removeTiles } from '../src/game/board.js';
import {
  MARK_NONE,
  MARK_GOLD,
  MARK_ICE,
  MARK_BOMB,
  MARK_CHRONO,
  GOLD_MULTIPLIER,
  CHRONO_SURGE_SECONDS,
  CHRONO_FREEZE_SECONDS,
  getMark,
  setMark,
  getFuse,
  setFuse,
  clearMark,
  listMarks,
  sprinkleMarks,
  tickBombs,
  resolveMatchMarks,
} from '../src/game/marks.js';

test('an untouched board carries no marks and reading one is safe', () => {
  const board = boardFromGrid([[1, 1]]);
  assert.equal(getMark(board, 1, 1), MARK_NONE);
  assert.equal(getFuse(board, 1, 1), 0);
  assert.deepEqual(listMarks(board), []);
});

test('reading or writing a mark outside the board never throws', () => {
  const board = boardFromGrid([[1, 1]]);
  assert.equal(getMark(board, 0, 0), MARK_NONE);
  assert.equal(getMark(board, 99, 99), MARK_NONE);
  assert.doesNotThrow(() => setMark(board, 99, 99, MARK_GOLD));
  assert.doesNotThrow(() => setFuse(board, -1, -1, 5));
});

test('marks and fuses round-trip and clear together', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_BOMB);
  setFuse(board, 1, 1, 7);
  assert.equal(getMark(board, 1, 1), MARK_BOMB);
  assert.equal(getFuse(board, 1, 1), 7);
  clearMark(board, 1, 1);
  assert.equal(getMark(board, 1, 1), MARK_NONE);
  assert.equal(getFuse(board, 1, 1), 0);
});

test('listMarks only reports marks that still sit under a tile', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  setMark(board, 1, 1, MARK_GOLD);
  setMark(board, 2, 1, MARK_ICE);
  assert.equal(listMarks(board).length, 2);

  removeTiles(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  const left = listMarks(board);
  assert.equal(left.length, 1);
  assert.equal(left[0].mark, MARK_ICE);
});

test('sprinkleMarks places exactly the requested counts and is seed-stable', () => {
  const make = () => createBoard({ rows: 6, cols: 6, iconCount: 8, seed: 42 });
  const a = make();
  const b = make();
  const placedA = sprinkleMarks(a, { seed: 99, gold: 3, ice: 2, bomb: 1 });
  sprinkleMarks(b, { seed: 99, gold: 3, ice: 2, bomb: 1 });

  assert.deepEqual(placedA, { gold: 3, ice: 2, bomb: 1 });
  assert.deepEqual(listMarks(a), listMarks(b), 'same seed must mark the same cells');
  assert.equal(listMarks(a).filter((m) => m.mark === MARK_GOLD).length, 3);
  assert.equal(listMarks(a).filter((m) => m.mark === MARK_ICE).length, 2);
  assert.equal(listMarks(a).filter((m) => m.mark === MARK_BOMB).length, 1);
});

test('sprinkleMarks never marks the same tile twice and never overruns the board', () => {
  const board = boardFromGrid([
    [1, 1],
    [2, 2],
  ]);
  const placed = sprinkleMarks(board, { seed: 5, gold: 10, ice: 10, bomb: 10 });
  const marked = listMarks(board);
  assert.equal(marked.length, 4, 'a 4-tile board can hold at most 4 marks');
  assert.equal(placed.gold + placed.ice + placed.bomb, 4);
  const keys = new Set(marked.map((m) => `${m.r},${m.c}`));
  assert.equal(keys.size, marked.length, 'a tile was marked twice');
});

test('sprinkleMarks gives every bomb a fuse and ignores negative counts', () => {
  const board = createBoard({ rows: 4, cols: 4, iconCount: 4, seed: 7 });
  sprinkleMarks(board, { seed: 3, bomb: 2, bombFuse: 9, gold: -5, ice: -1 });
  const bombs = listMarks(board).filter((m) => m.mark === MARK_BOMB);
  assert.equal(bombs.length, 2);
  for (const bomb of bombs) assert.equal(bomb.fuse, 9);
  assert.equal(listMarks(board).length, 2, 'negative counts must place nothing');
});

test('tickBombs counts every bomb down by one and reports none while fuses remain', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_BOMB);
  setFuse(board, 1, 1, 3);
  assert.deepEqual(tickBombs(board), []);
  assert.equal(getFuse(board, 1, 1), 2);
});

test('a bomb reaching zero explodes once and then defuses itself', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_BOMB);
  setFuse(board, 1, 1, 1);

  assert.deepEqual(tickBombs(board), [{ r: 1, c: 1 }]);
  assert.equal(getMark(board, 1, 1), MARK_NONE, 'an exploded bomb must not stay armed');
  assert.deepEqual(tickBombs(board), [], 'the same bomb must never explode twice');
});

test('tickBombs leaves gold and ice alone', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_GOLD);
  setMark(board, 1, 2, MARK_ICE);
  tickBombs(board);
  assert.equal(getMark(board, 1, 1), MARK_GOLD);
  assert.equal(getMark(board, 1, 2), MARK_ICE);
});

test('a plain pair resolves with no multiplier and clears normally', () => {
  const board = boardFromGrid([[1, 1]]);
  const result = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(result.survives, false);
  assert.equal(result.multiplier, 1);
  assert.deepEqual(result.cracked, []);
});

test('a gold tile on either side of the pair triples the score', () => {
  for (const c of [1, 2]) {
    const board = boardFromGrid([[1, 1]]);
    setMark(board, 1, c, MARK_GOLD);
    const result = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
    assert.equal(result.multiplier, GOLD_MULTIPLIER);
    assert.equal(result.survives, false, 'gold does not protect the tile');
  }
});

test('an iced tile survives its first match — the ice cracks instead', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_ICE);

  const first = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(first.survives, true);
  assert.deepEqual(first.cracked, [{ r: 1, c: 1 }]);
  assert.equal(getMark(board, 1, 1), MARK_NONE, 'the ice is gone after cracking');

  const second = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(second.survives, false, 'the second match must clear the pair');
});

test('two iced tiles both crack in one match and still leave the pair standing', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_ICE);
  setMark(board, 1, 2, MARK_ICE);
  const result = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(result.survives, true);
  assert.equal(result.cracked.length, 2);
});

test('gold and ice on the same pair crack first and keep the multiplier for the clearing match', () => {
  const board = boardFromGrid([[1, 1]]);
  setMark(board, 1, 1, MARK_ICE);
  setMark(board, 1, 2, MARK_GOLD);

  const first = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(first.survives, true);
  assert.equal(first.multiplier, GOLD_MULTIPLIER);

  const second = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
  assert.equal(second.survives, false);
  assert.equal(second.multiplier, GOLD_MULTIPLIER, 'the gold tile is still gold');
});

test('marks survive a board that has been dealt for real', () => {
  const board = createBoard({ rows: 8, cols: 8, iconCount: 12, seed: 2026 });
  sprinkleMarks(board, { seed: 1, gold: 4, ice: 4, bomb: 2 });
  const tiles = new Set(listTiles(board).map((t) => `${t.r},${t.c}`));
  for (const mark of listMarks(board)) {
    assert.ok(tiles.has(`${mark.r},${mark.c}`), 'a mark landed on an empty cell');
  }
});

test('a chrono tile on either side of the pair yields time surge and freeze', () => {
  for (const c of [1, 2]) {
    const board = boardFromGrid([[1, 1]]);
    setMark(board, 1, c, MARK_CHRONO);
    const result = resolveMatchMarks(board, { r: 1, c: 1 }, { r: 1, c: 2 });
    assert.equal(result.timeGain, CHRONO_SURGE_SECONDS);
    assert.equal(result.timeFreeze, CHRONO_FREEZE_SECONDS);
    assert.equal(result.survives, false, 'chrono clears cleanly');
  }
});

test('sprinkleMarks places chrono marks when requested', () => {
  const board = createBoard({ rows: 6, cols: 6, iconCount: 8, seed: 77 });
  const placed = sprinkleMarks(board, { seed: 10, chrono: 3, gold: 2 });
  assert.equal(placed.chrono, 3);
  assert.equal(placed.gold, 2);
  const chronos = listMarks(board).filter((m) => m.mark === MARK_CHRONO);
  assert.equal(chronos.length, 3);
});

