/**
 * A headless second player, for exercising online mode without two browsers.
 *
 *   node scripts/bot-player.mjs <ROOM> [--server ws://127.0.0.1:8787]
 *                                     [--name Bot] [--delay 900] [--board normal]
 *
 * It joins the room, hosts if it gets there first, starts the duel once someone
 * else arrives, then actually plays: it rebuilds the board from the seed and
 * clears a pair every `delay` ms, reporting progress like a real client.
 */

import { createSession, select, requestShuffle } from '../src/game/session.js';
import { findAnyMove } from '../src/game/connect.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const room = (args[0] ?? '').toUpperCase();
if (!room) {
  console.error('usage: node scripts/bot-player.mjs <ROOM> [--server url] [--name Bot] [--delay ms]');
  process.exit(1);
}

const server = String(flag('server', 'ws://127.0.0.1:8787')).replace(/^http/, 'ws').replace(/\/$/, '');
const name = String(flag('name', 'Bot'));
const delay = Number(flag('delay', 900));
const board = String(flag('board', 'normal'));

const PRESETS = {
  easy: { rows: 8, cols: 10, iconCount: 16, hints: 3, shuffles: 3 },
  normal: { rows: 10, cols: 12, iconCount: 20, hints: 2, shuffles: 2 },
  hard: { rows: 12, cols: 14, iconCount: 24, hints: 1, shuffles: 1 },
};

const id = `bot-${room}-${Math.floor(Math.random() * 1e6)}`;
const ws = new WebSocket(`${server}/room/${room}`);
const send = (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

let me = null;
let isHost = false;
let session = null;
let playTimer = null;
let started = 0;

function stopPlaying() {
  clearInterval(playTimer);
  playTimer = null;
}

function playOneMove() {
  if (!session || session.status !== 'playing') return stopPlaying();

  const move = findAnyMove(session.board);
  if (!move) {
    if (!requestShuffle(session)) return stopPlaying();
    return;
  }

  select(session, move.a.r, move.a.c);
  const result = select(session, move.b.r, move.b.c);
  send({ t: 'progress', score: session.score, pairs: session.matchedPairs, streak: session.streak });

  if (result.won) {
    stopPlaying();
    const elapsed = Math.round((Date.now() - started) / 1000);
    send({ t: 'finish', reason: 'cleared', score: session.score, pairs: session.matchedPairs, elapsed });
    console.log(`cleared the board in ${elapsed}s, score ${session.score}`);
  }
}

ws.addEventListener('open', () => {
  console.log(`joining ${room} as ${name}`);
  send({ t: 'join', playerId: id, name });
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.t) {
    case 'welcome':
      me = msg.you;
      isHost = msg.hostId === me;
      console.log(`in room ${msg.code} as ${isHost ? 'host' : 'guest'}; waiting for an opponent`);
      if (isHost) send({ t: 'settings', difficulty: board, clock: 300 });
      break;

    case 'peers': {
      isHost = msg.hostId === me;
      const here = msg.players.filter((p) => p.connected);
      console.log(`roster: ${here.map((p) => p.name).join(' vs ') || 'empty'}`);
      if (isHost && here.length >= 2 && !session) send({ t: 'start' });
      break;
    }

    case 'start': {
      const preset = PRESETS[msg.settings.difficulty] ?? PRESETS.normal;
      session = createSession({ ...preset, seed: msg.seed, label: name });
      started = Date.now();
      console.log(`duel on: ${msg.settings.difficulty}, seed ${msg.seed}`);
      stopPlaying();
      playTimer = setInterval(playOneMove, delay);
      break;
    }

    case 'progress':
      console.log(`opponent: ${msg.pairs} pairs, ${msg.score} points`);
      break;

    case 'result':
      stopPlaying();
      session = null;
      console.log(msg.winner === me ? 'bot wins' : msg.winner ? 'bot loses' : 'draw');
      break;

    case 'peer_left':
      console.log('opponent left');
      break;

    case 'error':
      console.log(`relay error: ${msg.code}`);
      break;

    default:
      break;
  }
});

ws.addEventListener('close', () => {
  stopPlaying();
  console.log('disconnected');
  process.exit(0);
});

process.on('SIGINT', () => {
  ws.close();
});
