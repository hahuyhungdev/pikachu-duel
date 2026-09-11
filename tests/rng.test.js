import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, shuffleInPlace, randomSeed } from '../src/game/rng.js';

test('createRng is deterministic for the same seed', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('createRng diverges for different seeds', () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notDeepEqual(
    Array.from({ length: 10 }, () => a()),
    Array.from({ length: 10 }, () => b()),
  );
});

test('createRng yields values inside [0, 1)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 500; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('shuffleInPlace keeps every element (is a permutation)', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const shuffled = shuffleInPlace([...input], createRng(7));
  assert.equal(shuffled.length, input.length);
  assert.deepEqual([...shuffled].sort((x, y) => x - y), input);
});

test('shuffleInPlace with the same seed gives the same order', () => {
  const base = Array.from({ length: 30 }, (_, i) => i);
  const one = shuffleInPlace([...base], createRng(42));
  const two = shuffleInPlace([...base], createRng(42));
  assert.deepEqual(one, two);
  assert.notDeepEqual(one, base);
});

test('randomSeed returns a positive 32-bit integer', () => {
  for (let i = 0; i < 20; i += 1) {
    const seed = randomSeed();
    assert.ok(Number.isInteger(seed), 'seed must be an integer');
    assert.ok(seed > 0 && seed <= 0xffffffff, `seed out of range: ${seed}`);
  }
});
