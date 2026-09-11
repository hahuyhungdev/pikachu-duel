import test from 'node:test';
import assert from 'node:assert/strict';
import { GameData } from '../server/src/gameData.js';

function createMockCtx() {
  const store = new Map();
  return {
    storage: {
      get: async (key) => (store.has(key) ? structuredClone(store.get(key)) : undefined),
      put: async (key, val) => store.set(key, structuredClone(val)),
    },
  };
}

test('GameData register and login lifecycle', async () => {
  const ctx = createMockCtx();
  const gd = new GameData(ctx, {});

  // 1. Register a new user
  const regReq = new Request('https://api/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'PikaMaster', password: 'secretpassword123', avatar: 'pikachu' }),
  });
  const regRes = await gd.fetch(regReq);
  assert.equal(regRes.status, 201);
  const regData = await regRes.json();
  assert.equal(regData.ok, true);
  assert.equal(regData.user.username, 'PikaMaster');
  assert.equal(regData.user.avatar, 'pikachu');
  assert.ok(regData.token.startsWith('tok_'));

  // 2. Reject duplicate username (case-insensitive)
  const dupReq = new Request('https://api/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'pikamaster', password: 'otherpassword', avatar: 'gengar' }),
  });
  const dupRes = await gd.fetch(dupReq);
  assert.equal(dupRes.status, 409);

  // 3. Login with correct credentials
  const loginReq = new Request('https://api/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'PikaMaster', password: 'secretpassword123' }),
  });
  const loginRes = await gd.fetch(loginReq);
  assert.equal(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.equal(loginData.ok, true);
  assert.equal(loginData.user.username, 'PikaMaster');

  // 4. Reject wrong password
  const badLoginReq = new Request('https://api/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'PikaMaster', password: 'wrongpassword' }),
  });
  const badLoginRes = await gd.fetch(badLoginReq);
  assert.equal(badLoginRes.status, 401);

  // 5. Get current user profile (auth/me)
  const meReq = new Request('https://api/api/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const meRes = await gd.fetch(meReq);
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.username, 'PikaMaster');
});

test('GameData score submission and leaderboard rankings', async () => {
  const ctx = createMockCtx();
  const gd = new GameData(ctx, {});

  // Register Player 1
  const reg1 = await gd.fetch(
    new Request('https://api/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'PlayerOne', password: 'pass', avatar: 'pikachu' }),
    }),
  );
  const p1 = await reg1.json();

  // Register Player 2
  const reg2 = await gd.fetch(
    new Request('https://api/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'PlayerTwo', password: 'pass', avatar: 'charmander' }),
    }),
  );
  const p2 = await reg2.json();

  // Submit scores for Adventure mode
  // P1 gets stage 5, score 12000
  await gd.fetch(
    new Request('https://api/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1.token}` },
      body: JSON.stringify({ mode: 'adventure', stage: 5, score: 12000, streak: 8, pairs: 30 }),
    }),
  );

  // P2 gets stage 7, score 18000
  await gd.fetch(
    new Request('https://api/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2.token}` },
      body: JSON.stringify({ mode: 'adventure', stage: 7, score: 18000, streak: 12, pairs: 45 }),
    }),
  );

  // Guest submission (stage 3, score 5000)
  await gd.fetch(
    new Request('https://api/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'adventure', stage: 3, score: 5000, streak: 4, pairs: 15, guestName: 'GuestGamer' }),
    }),
  );

  // Fetch Leaderboard for adventure
  const lbReq = new Request('https://api/api/leaderboard?mode=adventure', {
    method: 'GET',
    headers: { Authorization: `Bearer ${p1.token}` },
  });
  const lbRes = await gd.fetch(lbReq);
  assert.equal(lbRes.status, 200);
  const lb = await lbRes.json();
  assert.equal(lb.ok, true);
  assert.equal(lb.entries.length, 3);

  // Top 1 should be PlayerTwo (stage 7)
  assert.equal(lb.entries[0].username, 'PlayerTwo');
  assert.equal(lb.entries[0].stage, 7);
  assert.equal(lb.entries[0].rank, 1);

  // Top 2 should be PlayerOne (stage 5)
  assert.equal(lb.entries[1].username, 'PlayerOne');
  assert.equal(lb.entries[1].stage, 5);
  assert.equal(lb.entries[1].rank, 2);

  // Authenticated user rank for P1 should be rank 2
  assert.ok(lb.userEntry);
  assert.equal(lb.userEntry.username, 'PlayerOne');
  assert.equal(lb.userEntry.rank, 2);
});
