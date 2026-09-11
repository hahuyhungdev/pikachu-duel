import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_STAGE, stageConfig } from '../src/game/stages.js';
import {
  MODE_IDS,
  MODES,
  isGameMode,
  modeRules,
  dailyKey,
  dailySeed,
  dailyStage,
  buildRound,
} from '../src/game/modes.js';

test('every advertised mode is fully described', () => {
  assert.ok(MODE_IDS.includes('classic'));
  for (const id of ['adventure', 'timeattack', 'daily', 'zen']) {
    assert.ok(MODE_IDS.includes(id), `missing mode ${id}`);
  }
  for (const id of MODE_IDS) {
    const rules = MODES[id];
    assert.equal(rules.id, id);
    assert.ok(rules.label && rules.blurb, `${id} needs a label and a blurb`);
    assert.equal(typeof rules.ladder, 'boolean');
    assert.equal(typeof rules.timed, 'boolean');
    assert.ok(Number.isInteger(rules.hearts) && rules.hearts >= 0);
  }
});

test('an unknown mode falls back to classic instead of throwing', () => {
  assert.equal(isGameMode('adventure'), true);
  assert.equal(isGameMode('roguelike'), false);
  assert.equal(modeRules('roguelike').id, 'classic');
  assert.equal(modeRules(undefined).id, 'classic');
});

test('the modes actually differ from one another', () => {
  assert.equal(MODES.zen.timed, false, 'Zen must have no clock');
  assert.equal(MODES.zen.hearts, 0);
  assert.ok(MODES.adventure.ladder, 'Adventure must climb the stage ladder');
  assert.ok(MODES.adventure.hearts > 0, 'Adventure needs lives to lose');
  assert.ok(MODES.timeattack.timeGain.match > 0, 'Time Attack must pay time for a match');
  assert.ok(MODES.timeattack.startClock < MODES.classic.startClock, 'Time Attack starts short');
  assert.equal(MODES.daily.hearts, 0, 'the Daily is a single honest attempt');
});

test('Time Attack pays more time for a match made in fever', () => {
  assert.ok(MODES.timeattack.timeGain.fever > MODES.timeattack.timeGain.match);
});

test('the daily key is the local calendar day', () => {
  assert.equal(dailyKey(new Date(2026, 8, 11, 23, 59)), '2026-09-11');
  assert.equal(dailyKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('the daily seed is stable within a day and changes the next day', () => {
  const morning = new Date(2026, 8, 11, 7, 0);
  const midnight = new Date(2026, 8, 11, 23, 59);
  const tomorrow = new Date(2026, 8, 12, 7, 0);

  assert.equal(dailySeed(morning), dailySeed(midnight), 'everyone plays the same board all day');
  assert.notEqual(dailySeed(morning), dailySeed(tomorrow), 'a new day must be a new board');
  assert.ok(Number.isSafeInteger(dailySeed(morning)) && dailySeed(morning) > 0);
});

test('the daily stage stays in a fair, playable band', () => {
  for (let day = 1; day <= 60; day += 1) {
    const stage = dailyStage(new Date(2026, 0, day));
    assert.ok(Number.isInteger(stage) && stage >= 3 && stage <= 15, `day ${day} gave stage ${stage}`);
  }
});

test('buildRound on the ladder mirrors the stage recipe exactly', () => {
  const round = buildRound({ mode: 'adventure', stage: 8, seed: 123 });
  const config = stageConfig(8);
  assert.equal(round.mode, 'adventure');
  assert.equal(round.stage, 8);
  assert.equal(round.rows, config.rows);
  assert.equal(round.cols, config.cols);
  assert.equal(round.gravity, config.gravity);
  assert.equal(round.gold, config.gold);
  assert.equal(round.seed, 123);
});

test('buildRound for classic uses the chosen preset and ignores the ladder', () => {
  const round = buildRound({ mode: 'classic', difficulty: 'hard', seed: 7 });
  assert.equal(round.rows, 12);
  assert.equal(round.cols, 16);
  assert.equal(round.gravity, 'none', 'classic must stay the plain game');
  assert.equal(round.gold + round.ice + round.bomb, 0);
});

test('buildRound for Zen hands out no clock at all', () => {
  const round = buildRound({ mode: 'zen', difficulty: 'normal', seed: 1 });
  assert.equal(round.timed, false);
  assert.equal(round.clock, 0);
  assert.ok(round.hints >= 0);
});

test('buildRound for Time Attack starts on a short clock that the player extends', () => {
  const round = buildRound({ mode: 'timeattack', seed: 1 });
  assert.equal(round.timed, true);
  assert.equal(round.clock, MODES.timeattack.startClock);
  assert.ok(round.timeGain.match > 0);
});

test('buildRound for the Daily derives its own seed and stage from the date', () => {
  const day = new Date(2026, 8, 11, 12, 0);
  const round = buildRound({ mode: 'daily', now: day });
  assert.equal(round.seed, dailySeed(day));
  assert.equal(round.stage, dailyStage(day));
  assert.equal(round.day, '2026-09-11');
  assert.deepEqual(
    { rows: round.rows, cols: round.cols },
    { rows: stageConfig(round.stage).rows, cols: stageConfig(round.stage).cols },
  );
});

test('buildRound always returns a complete, usable round', () => {
  for (const mode of MODE_IDS) {
    const round = buildRound({ mode, seed: 99, stage: FIRST_STAGE, difficulty: 'normal' });
    assert.ok(round.rows > 0 && round.cols > 0, `${mode} has no board`);
    assert.equal((round.rows * round.cols) % 2, 0, `${mode} board has an odd cell count`);
    assert.ok(round.seed > 0, `${mode} has no seed`);
    assert.ok(Number.isInteger(round.hearts) && round.hearts >= 0, `${mode} hearts invalid`);
    assert.ok(round.clock >= 0, `${mode} clock invalid`);
  }
});

test('buildRound never mutates the arguments it was handed', () => {
  const args = { mode: 'adventure', stage: 5, seed: 3 };
  const snapshot = { ...args };
  buildRound(args);
  assert.deepEqual(args, snapshot);
});
