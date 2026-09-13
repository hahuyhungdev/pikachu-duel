import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ICONS } from '../src/game/icons.js';
import {
  FIRST_STAGE,
  stageConfig,
  stageStars,
  stageObjective,
  describeStage,
} from '../src/game/stages.js';

const STAGES = Array.from({ length: 30 }, (_, i) => i + FIRST_STAGE);

test('every stage produces a board that can actually be dealt', () => {
  for (const stage of STAGES) {
    const config = stageConfig(stage);
    assert.ok(config.rows >= 4 && config.cols >= 4, `stage ${stage} board too small`);
    assert.equal((config.rows * config.cols) % 2, 0, `stage ${stage} has an odd cell count`);
    assert.ok(config.iconCount >= 1 && config.iconCount <= MAX_ICONS, `stage ${stage} icon count out of range`);
    assert.ok(config.clock > 0, `stage ${stage} has no clock`);
  }
});

test('stageConfig is pure — the same stage always returns the same setup', () => {
  assert.deepEqual(stageConfig(7), stageConfig(7));
  assert.notDeepEqual(stageConfig(1), stageConfig(12));
});

test('a stage below the first is clamped instead of returning nonsense', () => {
  assert.deepEqual(stageConfig(0), stageConfig(FIRST_STAGE));
  assert.deepEqual(stageConfig(-5), stageConfig(FIRST_STAGE));
  assert.deepEqual(stageConfig(NaN), stageConfig(FIRST_STAGE));
});

test('the ladder never stops — very deep stages still return a playable board', () => {
  const deep = stageConfig(500);
  assert.ok(deep.rows * deep.cols >= 16);
  assert.ok(deep.clock > 0);
  assert.ok(Number.isFinite(deep.pairs));
});

test('the opening stages teach the plain game before any twist', () => {
  const first = stageConfig(FIRST_STAGE);
  assert.equal(first.gravity, 'none', 'stage 1 must not move the board');
  assert.deepEqual(
    { gold: first.gold, ice: first.ice, bomb: first.bomb },
    { gold: 0, ice: 0, bomb: 0 },
    'stage 1 must have no special tiles',
  );
  assert.ok(first.hints >= 2 && first.shuffles >= 2, 'stage 1 should be forgiving');
});

test('each twist is introduced once and then stays available', () => {
  const firstWith = (key) => STAGES.find((s) => stageConfig(s)[key] > 0);
  const goldAt = firstWith('gold');
  const chronoAt = firstWith('chrono');
  const iceAt = firstWith('ice');
  const bombAt = firstWith('bomb');
  const gravityAt = STAGES.find((s) => stageConfig(s).gravity !== 'none');

  assert.ok(goldAt < chronoAt, 'gold must arrive before chrono');
  assert.ok(chronoAt < iceAt, 'chrono must arrive before ice');
  assert.ok(iceAt < bombAt, 'ice must arrive before the punishing bomb');
  assert.ok(gravityAt > FIRST_STAGE, 'gravity must not be live on the very first stage');
  assert.ok(bombAt <= 12, `the bomb arrives too late to matter (stage ${bombAt})`);
});

test('the ladder gets harder: boards grow and the clock per pair tightens', () => {
  const early = stageConfig(FIRST_STAGE);
  const late = stageConfig(20);
  assert.ok(late.pairs > early.pairs, 'later stages must hold more pairs');
  assert.ok(late.clock / late.pairs < early.clock / early.pairs, 'later stages must be more rushed');
  assert.ok(late.hints <= early.hints && late.shuffles <= early.shuffles);
});

test('difficulty never spikes backwards between neighbouring stages', () => {
  for (let stage = FIRST_STAGE; stage < 40; stage += 1) {
    const here = stageConfig(stage);
    const next = stageConfig(stage + 1);
    assert.ok(next.pairs >= here.pairs, `stage ${stage + 1} shrank the board`);
    assert.ok(next.hints <= here.hints, `stage ${stage + 1} handed back a hint`);
  }
});

test('gravity cycles through the variants rather than repeating one forever', () => {
  const used = new Set(STAGES.map((s) => stageConfig(s).gravity));
  used.delete('none');
  assert.ok(used.size >= 4, `only ${used.size} gravity variants appear in 30 stages`);
});

test('specials are always placeable on the board they belong to', () => {
  for (const stage of STAGES) {
    const config = stageConfig(stage);
    const total = config.gold + (config.chrono || 0) + config.ice + config.bomb;
    assert.ok(total <= config.rows * config.cols, `stage ${stage} asks for more marks than cells`);
    if (config.bomb > 0) assert.ok(config.bombFuse > 0, `stage ${stage} has a bomb with no fuse`);
  }
});

test('stageObjective states a target the player can read and aim at', () => {
  const objective = stageObjective(5);
  assert.equal(typeof objective.text, 'string');
  assert.ok(objective.text.length > 0);
  assert.ok(objective.target > 0);
});

test('stars reward clearing first, then score', () => {
  const stage = 4;
  const { silver, gold } = stageConfig(stage).stars;

  assert.equal(stageStars(stage, { cleared: false, score: gold * 2 }), 0, 'a failed run earns nothing');
  assert.equal(stageStars(stage, { cleared: true, score: 0 }), 1, 'clearing alone is worth one star');
  assert.equal(stageStars(stage, { cleared: true, score: silver }), 2);
  assert.equal(stageStars(stage, { cleared: true, score: gold }), 3);
  assert.equal(stageStars(stage, { cleared: true, score: gold * 10 }), 3, 'three stars is the cap');
});

test('star thresholds rise with the stage so they stay meaningful', () => {
  assert.ok(stageConfig(20).stars.gold > stageConfig(2).stars.gold);
  assert.ok(stageConfig(2).stars.silver < stageConfig(2).stars.gold);
});

test('describeStage gives the HUD a short human summary of what is different', () => {
  const plain = describeStage(FIRST_STAGE);
  assert.equal(typeof plain, 'string');

  const twisted = describeStage(20);
  assert.ok(twisted.length > 0);
  assert.notEqual(twisted, plain, 'a late stage should not read like the first');
});

test('stages feature diverse Pokémon species right from early stages with mascot Pikachu guaranteed', () => {
  for (const stage of [1, 2, 3, 5, 10, 16]) {
    const config = stageConfig(stage);
    assert.ok(Array.isArray(config.iconPool));
    assert.equal(config.iconPool.length, config.iconCount);
    // Pikachu (icon 1) is always present
    assert.ok(config.iconPool.includes(1), `stage ${stage} missing Pikachu`);
    // Icons are strictly within valid 1..MAX_ICONS range and unique
    const unique = new Set(config.iconPool);
    assert.equal(unique.size, config.iconCount);
    for (const id of config.iconPool) {
      assert.ok(id >= 1 && id <= MAX_ICONS);
    }
  }

  // Early stages (1 and 2) already feature Pokémon species beyond index 20 (e.g. Charizard, Eevee, Blastoise)
  const stage1 = stageConfig(1);
  const stage2 = stageConfig(2);
  assert.ok(stage1.iconPool.some((id) => id > 20), 'stage 1 should have diverse Pokémon');
  assert.ok(stage2.iconPool.some((id) => id > 20), 'stage 2 should have diverse Pokémon');
  // Different stages have different sets of Pokémon
  assert.notDeepEqual(stage1.iconPool, stage2.iconPool);
});
