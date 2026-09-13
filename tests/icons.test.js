import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICONS, MAX_ICONS, iconFor } from '../src/game/icons.js';
import { PRESETS } from '../src/shared/game/presets.js';
import { createBoard, listTiles, toGrid } from '../src/game/board.js';

test('hard games offer 48 distinct bundled sprites without changing classic difficulty', () => {
  assert.equal(MAX_ICONS, 48);
  assert.equal(new Set(ICONS.map((icon) => icon.label)).size, 48);
  assert.equal(new Set(ICONS.map((icon) => icon.src)).size, 48);
  assert.equal(iconFor(1).label, 'Pikachu');
  assert.equal(iconFor(24).label, 'Magikarp');
  assert.equal(PRESETS.easy.iconCount, 16);
  assert.equal(PRESETS.normal.iconCount, 24);
  assert.equal(PRESETS.medium.iconCount, 24);
  assert.equal(PRESETS.hard.iconCount, 48);
  for (const icon of ICONS) {
    const bytes = readFileSync(new URL(icon.src));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 64);
    assert.equal(bytes.readUInt32BE(20), 64);
  }
});

test('48-species hard boards give both players identical maps with complete pairs', () => {
  const options = { ...PRESETS.hard, seed: 20260913 };
  const board = createBoard(options);
  assert.deepEqual(toGrid(board), toGrid(createBoard(options)));
  const counts = new Map();
  for (const tile of listTiles(board)) counts.set(tile.icon, (counts.get(tile.icon) ?? 0) + 1);
  assert.equal(counts.size, 48);
  assert.equal(board.remaining, 192);
  for (const [id, count] of counts) {
    assert.ok(iconFor(id));
    assert.equal(count % 2, 0);
  }
});
