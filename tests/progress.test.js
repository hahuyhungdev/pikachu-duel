import test from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../server/src/gameData.js';

function service() {
  const store = new Map([
    ['sessions', { token_a: { userId: 'a' }, token_b: { userId: 'b' } }],
    ['users', { a: { id: 'a' }, b: { id: 'b' } }],
  ]);
  let lock = Promise.resolve();
  const storage = {
    get: async (key) => structuredClone(store.get(key)),
    put: async (key, value) => { store.set(key, structuredClone(value)); },
    transaction: (callback) => {
      const next = lock.then(() => callback(storage));
      lock = next.catch(() => {});
      return next;
    },
  };
  return new GameData({ storage }, {});
}

function request(token, profile, method = profile === undefined ? 'GET' : 'PUT') {
  return new Request('https://api/api/progress', {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(profile === undefined ? {} : { body: JSON.stringify({ profile }) }),
  });
}

test('progress requires authentication and belongs only to the authenticated account', async () => {
  const game = service();
  assert.equal((await game.fetch(request(null))).status, 401);
  assert.equal((await game.fetch(request(null, {}))).status, 401);
  const saved = await game.fetch(request('token_a', { totalPairs: 45, userId: 'b' }));
  assert.equal(saved.status, 200);
  assert.equal((await (await game.fetch(request('token_a'))).json()).profile.totalPairs, 45);
  assert.equal((await (await game.fetch(request('token_b'))).json()).profile.totalPairs, 0);
});

test('progress snapshots merge records, stars and unlocks without counting retries twice', async () => {
  const game = service();
  const first = { totalPairs: 100, totalPlays: 2, modes: { adventure: { bestScore: 400, bestStage: 3, plays: 2 } }, stageStars: { 1: 3 }, unlocks: ['pairs-100'] };
  await game.fetch(request('token_a', first));
  await game.fetch(request('token_a', first));
  await Promise.all([
    game.fetch(request('token_a', { ...first, stageStars: { 2: 2 } })),
    game.fetch(request('token_a', { totalPairs: 50, modes: { adventure: { bestScore: 900 } }, stageStars: { 1: 1, 3: 3 }, unlocks: ['first-clear'] })),
  ]);
  const { profile } = await (await game.fetch(request('token_a'))).json();
  assert.equal(profile.totalPairs, 100);
  assert.equal(profile.totalPlays, 2);
  assert.equal(profile.modes.adventure.bestScore, 900);
  assert.equal(profile.modes.adventure.bestStage, 3);
  assert.deepEqual(profile.stageStars, { 1: 3, 2: 2, 3: 3 });
  assert.deepEqual(profile.unlocks.sort(), ['first-clear', 'pairs-100']);
});

test('progress bounds payloads and whitelists stored fields', async () => {
  const game = service();
  assert.equal((await game.fetch(request('token_a', null))).status, 400);
  assert.equal((await game.fetch(request('token_a', { junk: 'x'.repeat(40000) }))).status, 413);
  const response = await game.fetch(request('token_a', {
    totalPairs: -3, totalPlays: 1e99, admin: true,
    unlocks: ['unknown', 'first-clear', 'first-clear'],
    stageStars: { 1: 100, 2: '3', 10001: 3 },
  }));
  const { profile } = await response.json();
  assert.equal(profile.totalPairs, 0);
  assert.equal(profile.totalPlays, 1e9);
  assert.equal(profile.admin, undefined);
  assert.deepEqual(profile.unlocks, ['first-clear']);
  assert.deepEqual(profile.stageStars, { 1: 3 });
});
