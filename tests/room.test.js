import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, handle, MAX_PLAYERS } from '../server/src/room.js';

const NOW = 1_757_000_000_000;

/** Drive a list of events through the machine, returning the last result. */
function run(state, events) {
  let out = [];
  for (const event of events) {
    const result = handle(state, { now: NOW, nextSeed: 4242, ...event });
    state = result.state;
    out = result.out;
  }
  return { state, out };
}

const join = (from, name) => ({ type: 'join', from, payload: { name } });
const sent = (out, t) => out.filter((entry) => entry.msg.t === t);
const msgFor = (out, t) => sent(out, t)[0]?.msg;

function lobbyOfTwo() {
  return run(createRoom('ABC123'), [join('a', 'Ash'), join('b', 'Misty')]).state;
}

function playingPair() {
  return run(lobbyOfTwo(), [{ type: 'start', from: 'a' }]).state;
}

test('a new room starts empty, in the lobby, with no host', () => {
  const state = createRoom('ABC123');
  assert.equal(state.code, 'ABC123');
  assert.equal(state.status, 'lobby');
  assert.equal(state.hostId, null);
  assert.deepEqual(Object.keys(state.players), []);
  assert.equal(state.seed, null);
});

test('the first player to join becomes host and takes slot 1', () => {
  const { state, out } = run(createRoom('ABC123'), [join('a', 'Ash')]);
  assert.equal(state.hostId, 'a');
  assert.equal(state.players.a.slot, 1);
  assert.equal(state.players.a.name, 'Ash');
  const welcome = msgFor(out, 'welcome');
  assert.ok(welcome, 'expected a welcome addressed to the joiner');
  assert.equal(sent(out, 'welcome')[0].to, 'a');
  assert.equal(welcome.you, 'a');
  assert.equal(welcome.status, 'lobby');
});

test('the second player takes slot 2 and everyone is told the roster', () => {
  const { state, out } = run(createRoom('ABC123'), [join('a', 'Ash'), join('b', 'Misty')]);
  assert.equal(state.players.b.slot, 2);
  assert.equal(state.hostId, 'a', 'the host does not change');
  const peers = msgFor(out, 'peers');
  assert.ok(peers);
  assert.equal(sent(out, 'peers')[0].to, 'all');
  assert.equal(peers.players.length, 2);
});

test('a third player is turned away and the roster is untouched', () => {
  const full = lobbyOfTwo();
  const { state, out } = run(full, [join('c', 'Brock')]);
  assert.equal(Object.keys(state.players).length, MAX_PLAYERS);
  assert.equal(state.players.c, undefined);
  const error = msgFor(out, 'error');
  assert.equal(error.code, 'room_full');
  assert.equal(sent(out, 'error')[0].to, 'c');
});

test('rejoining with the same id is a reconnect, not a new player', () => {
  const { state } = run(lobbyOfTwo(), [
    { type: 'leave', from: 'b' },
    join('b', 'Misty'),
  ]);
  assert.equal(Object.keys(state.players).length, 2);
  assert.equal(state.players.b.slot, 2, 'the slot is kept across a reconnect');
  assert.equal(state.players.b.connected, true);
});

test('the host can change the settings and everyone hears about it', () => {
  const { state, out } = run(lobbyOfTwo(), [
    { type: 'settings', from: 'a', payload: { difficulty: 'hard', clock: 480 } },
  ]);
  assert.equal(state.settings.difficulty, 'hard');
  assert.equal(state.settings.clock, 480);
  assert.equal(sent(out, 'settings')[0].to, 'all');
});

test('a guest cannot change the settings', () => {
  const { state, out } = run(lobbyOfTwo(), [
    { type: 'settings', from: 'b', payload: { difficulty: 'hard', clock: 480 } },
  ]);
  assert.equal(state.settings.difficulty, 'normal');
  assert.equal(msgFor(out, 'error').code, 'not_host');
});

test('unknown settings values are refused rather than stored', () => {
  const { state } = run(lobbyOfTwo(), [
    { type: 'settings', from: 'a', payload: { difficulty: 'impossible', clock: 99 } },
  ]);
  assert.equal(state.settings.difficulty, 'normal');
  assert.equal(state.settings.clock, 300);
});

test('the host starts the duel and both players get the same seed', () => {
  const { state, out } = run(lobbyOfTwo(), [{ type: 'start', from: 'a', nextSeed: 987654 }]);
  assert.equal(state.status, 'playing');
  assert.equal(state.seed, 987654);
  assert.equal(state.startedAt, NOW);
  const start = msgFor(out, 'start');
  assert.equal(sent(out, 'start')[0].to, 'all');
  assert.equal(start.seed, 987654);
  assert.equal(start.settings.difficulty, 'normal');
  assert.equal(start.startedAt, NOW);
});

test('the duel cannot start alone', () => {
  const { state, out } = run(createRoom('ABC123'), [join('a', 'Ash'), { type: 'start', from: 'a' }]);
  assert.equal(state.status, 'lobby');
  assert.equal(msgFor(out, 'error').code, 'need_two');
});

test('a guest cannot start the duel', () => {
  const { state, out } = run(lobbyOfTwo(), [{ type: 'start', from: 'b' }]);
  assert.equal(state.status, 'lobby');
  assert.equal(msgFor(out, 'error').code, 'not_host');
});

test('starting clears the scores from the previous round', () => {
  let state = playingPair();
  ({ state } = run(state, [
    { type: 'progress', from: 'a', payload: { score: 500, pairs: 5, streak: 3 } },
    { type: 'finish', from: 'a', payload: { reason: 'cleared', score: 500, pairs: 60, elapsed: 90 } },
    { type: 'rematch', from: 'a' },
  ]));
  assert.equal(state.players.a.score, 0);
  assert.equal(state.players.a.pairs, 0);
  assert.equal(state.players.a.done, false);
  assert.equal(state.result, null);
});

test('progress is stored and relayed only to the opponent', () => {
  const { state, out } = run(playingPair(), [
    { type: 'progress', from: 'a', payload: { score: 350, pairs: 4, streak: 2 } },
  ]);
  assert.equal(state.players.a.score, 350);
  assert.equal(state.players.a.pairs, 4);
  const progress = sent(out, 'progress')[0];
  assert.equal(progress.to, 'others');
  assert.equal(progress.msg.from, 'a');
  assert.equal(progress.msg.pairs, 4);
});

test('progress outside a live game is ignored', () => {
  const { state, out } = run(lobbyOfTwo(), [
    { type: 'progress', from: 'a', payload: { score: 350, pairs: 4, streak: 2 } },
  ]);
  assert.equal(state.players.a.score, 0);
  assert.equal(sent(out, 'progress').length, 0);
});

test('progress from someone who is not in the room is ignored', () => {
  const { out } = run(playingPair(), [
    { type: 'progress', from: 'ghost', payload: { score: 1, pairs: 1, streak: 1 } },
  ]);
  assert.equal(sent(out, 'progress').length, 0);
});

test('clearing the board first wins the duel immediately', () => {
  const { state, out } = run(playingPair(), [
    { type: 'finish', from: 'b', payload: { reason: 'cleared', score: 900, pairs: 60, elapsed: 128 } },
  ]);
  assert.equal(state.status, 'over');
  assert.equal(state.result.winner, 'b');
  assert.equal(state.result.reason, 'cleared');
  const result = msgFor(out, 'result');
  assert.equal(sent(out, 'result')[0].to, 'all');
  assert.equal(result.winner, 'b');
  assert.equal(result.players.length, 2);
});

test('a second finish after the duel is over changes nothing', () => {
  let state = playingPair();
  ({ state } = run(state, [
    { type: 'finish', from: 'b', payload: { reason: 'cleared', score: 900, pairs: 60, elapsed: 128 } },
  ]));
  const after = run(state, [
    { type: 'finish', from: 'a', payload: { reason: 'cleared', score: 999, pairs: 60, elapsed: 130 } },
  ]);
  assert.equal(after.state.result.winner, 'b');
  assert.equal(sent(after.out, 'result').length, 0);
});

test('the clock running out waits for both players before judging', () => {
  let state = playingPair();
  const first = run(state, [
    { type: 'finish', from: 'a', payload: { reason: 'timeup', score: 400, pairs: 9, elapsed: 300 } },
  ]);
  assert.equal(first.state.status, 'playing', 'still waiting on the opponent');
  assert.equal(sent(first.out, 'result').length, 0);

  const second = run(first.state, [
    { type: 'finish', from: 'b', payload: { reason: 'timeup', score: 380, pairs: 7, elapsed: 300 } },
  ]);
  assert.equal(second.state.status, 'over');
  assert.equal(second.state.result.winner, 'a', 'most pairs wins on time');
  assert.equal(second.state.result.reason, 'timeup');
});

test('on equal pairs the higher score wins', () => {
  const { state } = run(playingPair(), [
    { type: 'finish', from: 'a', payload: { reason: 'timeup', score: 300, pairs: 8, elapsed: 300 } },
    { type: 'finish', from: 'b', payload: { reason: 'timeup', score: 500, pairs: 8, elapsed: 300 } },
  ]);
  assert.equal(state.result.winner, 'b');
});

test('identical pairs and score is a draw', () => {
  const { state } = run(playingPair(), [
    { type: 'finish', from: 'a', payload: { reason: 'timeup', score: 400, pairs: 8, elapsed: 300 } },
    { type: 'finish', from: 'b', payload: { reason: 'timeup', score: 400, pairs: 8, elapsed: 300 } },
  ]);
  assert.equal(state.status, 'over');
  assert.equal(state.result.winner, null);
});

test('losing the opponent mid-duel is announced but play continues', () => {
  const { state, out } = run(playingPair(), [{ type: 'leave', from: 'b' }]);
  assert.equal(state.status, 'playing');
  assert.equal(state.players.b.connected, false);
  const left = msgFor(out, 'peer_left');
  assert.ok(left);
  assert.equal(left.from, 'b');
});

test('when the host leaves, the remaining player takes over', () => {
  const { state } = run(lobbyOfTwo(), [{ type: 'leave', from: 'a' }]);
  assert.equal(state.hostId, 'b');
});

test('a rematch deals a fresh board by default', () => {
  let state = playingPair();
  const firstSeed = state.seed;
  ({ state } = run(state, [
    { type: 'finish', from: 'a', payload: { reason: 'cleared', score: 900, pairs: 60, elapsed: 100 } },
  ]));
  const { state: next, out } = run(state, [{ type: 'rematch', from: 'a', nextSeed: 777 }]);
  assert.equal(next.status, 'playing');
  assert.equal(next.seed, 777);
  assert.notEqual(next.seed, firstSeed);
  assert.equal(msgFor(out, 'start').seed, 777);
});

test('a rematch can replay the very same board', () => {
  let state = playingPair();
  const firstSeed = state.seed;
  ({ state } = run(state, [
    { type: 'finish', from: 'a', payload: { reason: 'cleared', score: 900, pairs: 60, elapsed: 100 } },
  ]));
  const { state: next } = run(state, [
    { type: 'rematch', from: 'a', payload: { sameSeed: true }, nextSeed: 777 },
  ]);
  assert.equal(next.seed, firstSeed);
});

test('a guest cannot force a rematch', () => {
  let state = playingPair();
  ({ state } = run(state, [
    { type: 'finish', from: 'a', payload: { reason: 'cleared', score: 900, pairs: 60, elapsed: 100 } },
  ]));
  const { state: next, out } = run(state, [{ type: 'rematch', from: 'b' }]);
  assert.equal(next.status, 'over');
  assert.equal(msgFor(out, 'error').code, 'not_host');
});

test('an unknown message type is reported without touching the room', () => {
  const before = lobbyOfTwo();
  const { state, out } = run(before, [{ type: 'explode', from: 'a' }]);
  assert.equal(state.status, 'lobby');
  assert.equal(msgFor(out, 'error').code, 'bad_message');
});
