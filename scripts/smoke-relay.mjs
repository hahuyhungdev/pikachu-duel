/**
 * End-to-end check of the relay protocol against a running Worker.
 *
 *   npx wrangler dev --config server/wrangler.jsonc --port 8787
 *   node scripts/smoke-relay.mjs [ws://127.0.0.1:8787]
 *
 * Drives two real WebSocket clients through a whole duel and asserts on what
 * comes back, so protocol regressions surface without a browser.
 */

import assert from 'node:assert/strict';

const base = (process.argv[2] ?? 'ws://127.0.0.1:8787').replace(/^http/, 'ws').replace(/\/$/, '');
// A fresh code every run: Durable Object state outlives the process, so a
// reused code would join a room that still holds the last run's players.
const code = Array.from({ length: 10 }, () =>
  'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
const failures = [];

function connect(name, playerId) {
  const ws = new WebSocket(`${base}/room/${code}`);
  const inbox = [];
  const waiters = [];

  // Created now, not when open() is called — otherwise a socket that opens
  // before the first await would never resolve.
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.t === 'pong') return;
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      const found = inbox.find(waiters[i].match);
      if (found) {
        waiters[i].resolve(found);
        waiters.splice(i, 1);
      }
    }
  });

  const client = {
    name,
    playerId,
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    open: () => ready,
    /**
     * Resolve with the first message of type `t` that also satisfies `where`.
     * Matching on content rather than arrival order keeps this immune to
     * messages that were already in flight.
     */
    expect(t, where = () => true, ms = 5000) {
      const match = (msg) => msg.t === t && where(msg);
      const already = inbox.find(match);
      if (already) return Promise.resolve(already);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          if (!waiters.includes(waiter)) return;
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`${name}: timed out waiting for "${t}" (saw ${inbox.map((m) => m.t).join(', ') || 'nothing'})`));
        }, ms);
      });
    },
    seen: (t) => inbox.some((msg) => msg.t === t),
    clear: () => { inbox.length = 0; },
  };
  return client;
}

async function step(label, fn) {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.log(`  FAIL ${label}\n       ${error.message}`);
  }
}

console.log(`relay ${base}, room ${code}\n`);

const host = connect('host', `host-${code}`);
const guest = connect('guest', `guest-${code}`);
let seed = null;

await step('health endpoint answers', async () => {
  const res = await fetch(`${base.replace(/^ws/, 'http')}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

await step('both clients connect', async () => {
  await Promise.all([host.open(), guest.open()]);
});

await step('host joins and is made host of slot 1', async () => {
  host.send({ t: 'join', playerId: host.playerId, name: 'Ash' });
  const welcome = await host.expect('welcome');
  assert.equal(welcome.you, host.playerId);
  assert.equal(welcome.hostId, host.playerId);
  assert.equal(welcome.players[0].slot, 1);
  assert.equal(welcome.status, 'lobby');
});

await step('guest joins as slot 2 and both see the roster', async () => {
  // The host already has a "peers" from its own join, listing one player.
  host.clear();
  guest.send({ t: 'join', playerId: guest.playerId, name: 'Misty' });
  const welcome = await guest.expect('welcome');
  assert.equal(welcome.players.length, 2);
  assert.equal(welcome.players[1].slot, 2);
  assert.equal(welcome.players[1].name, 'Misty');
  const peers = await host.expect('peers', (m) => m.players.length === 2);
  assert.equal(peers.players.length, 2);
  assert.deepEqual(peers.players.map((pl) => pl.slot), [1, 2]);
});

await step('a guest cannot change the settings', async () => {
  guest.send({ t: 'settings', difficulty: 'hard', clock: 480 });
  const error = await guest.expect('error');
  assert.equal(error.code, 'not_host');
});

await step('the host sets the board and both are told', async () => {
  host.send({ t: 'settings', difficulty: 'hard', clock: 180 });
  const settings = await guest.expect('settings');
  assert.equal(settings.settings.difficulty, 'hard');
  assert.equal(settings.settings.clock, 180);
});

await step('the host starts and both get the identical seed', async () => {
  host.send({ t: 'start' });
  const [a, b] = await Promise.all([host.expect('start'), guest.expect('start')]);
  assert.equal(a.seed, b.seed, 'both players must be dealt the same board');
  assert.ok(Number.isInteger(a.seed) && a.seed > 0);
  assert.equal(a.settings.difficulty, 'hard');
  seed = a.seed;
});

await step('progress reaches the opponent and not the sender', async () => {
  host.clear();
  guest.clear();
  host.send({ t: 'progress', score: 275, pairs: 3, streak: 2 });
  const progress = await guest.expect('progress');
  assert.equal(progress.from, host.playerId);
  assert.equal(progress.pairs, 3);
  assert.equal(host.seen('progress'), false, 'progress must not echo to its sender');
});

await step('clearing the board first wins the duel', async () => {
  guest.send({ t: 'finish', reason: 'cleared', score: 4200, pairs: 84, elapsed: 141 });
  const [a, b] = await Promise.all([host.expect('result'), guest.expect('result')]);
  assert.equal(a.winner, guest.playerId);
  assert.equal(a.reason, 'cleared');
  assert.deepEqual(a.players.map((p) => p.slot), [1, 2]);
  assert.equal(b.winner, guest.playerId);
});

await step('the host can call a rematch on the same board', async () => {
  host.clear();
  guest.clear();
  host.send({ t: 'rematch', sameSeed: true });
  const next = await guest.expect('start');
  assert.equal(next.seed, seed, 'sameSeed must replay the same deal');
  assert.equal(next.players.every((p) => p.pairs === 0), true, 'scores must reset');
});

await step('a third player is turned away', async () => {
  const extra = connect('extra', `extra-${code}`);
  await extra.open();
  extra.send({ t: 'join', playerId: extra.playerId, name: 'Brock' });
  const error = await extra.expect('error');
  assert.equal(error.code, 'room_full');
  extra.ws.close();
});

await step('a message before joining is refused, and it hears nothing else', async () => {
  const stranger = connect('stranger', `stray-${code}`);
  await stranger.open();
  stranger.send({ t: 'progress', score: 1, pairs: 1, streak: 1 });
  const error = await stranger.expect('error');
  assert.equal(error.code, 'not_joined');
  assert.equal(stranger.seen('peers'), false, 'a socket that has not joined must not see the roster');
  stranger.ws.close();
});

await step('a dropped opponent is announced', async () => {
  host.clear();
  guest.ws.close();
  const left = await host.expect('peer_left');
  assert.equal(left.from, guest.playerId);
});

host.ws.close();

console.log(`\n${failures.length === 0 ? 'all relay checks passed' : `${failures.length} failed`}`);
process.exit(failures.length === 0 ? 0 : 1);
