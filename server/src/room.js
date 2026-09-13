/**
 * The room state machine — pure, so it runs identically in the Durable Object
 * and in the test suite. No WebSockets, no timers, no globals: every event
 * carries the clock (`now`) and any randomness (`nextSeed`) it needs.
 *
 * handle() returns the next state plus the messages to send, addressed to
 * 'all', 'others' (everyone but the sender), or a specific player id.
 */

export const MAX_PLAYERS = 2;
export const DIFFICULTIES = ['easy', 'normal', 'medium', 'hard'];
export const CLOCKS = [180, 300, 480, 0];
const NAME_LIMIT = 18;

export function createRoom(code) {
  return {
    code,
    status: 'lobby',
    hostId: null,
    settings: { difficulty: 'normal', clock: 300 },
    seed: null,
    startedAt: null,
    players: {},
    result: null,
  };
}

const cleanName = (value, fallback) => {
  const name = typeof value === 'string' ? value.trim().slice(0, NAME_LIMIT) : '';
  return name || fallback;
};

const count = (value, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : 0;
};

const bySlot = (state) => Object.values(state.players).sort((a, b) => a.slot - b.slot);

function roster(state) {
  return bySlot(state).map((p) => ({
    id: p.id,
    slot: p.slot,
    name: p.name,
    score: p.score,
    pairs: p.pairs,
    streak: p.streak,
    done: p.done,
    reason: p.reason,
    elapsed: p.elapsed,
    connected: p.connected,
    host: p.id === state.hostId,
  }));
}

const peersMsg = (state) => ({ t: 'peers', hostId: state.hostId, players: roster(state) });
const fail = (to, code, detail) => [{ to, msg: { t: 'error', code, detail } }];

function freeSlot(state) {
  const taken = new Set(bySlot(state).map((p) => p.slot));
  for (let slot = 1; slot <= MAX_PLAYERS; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

function reassignHost(state) {
  if (state.hostId && state.players[state.hostId]?.connected) return;
  const next = bySlot(state).find((p) => p.connected);
  state.hostId = next ? next.id : null;
}

function beginRound(state, seed, now) {
  for (const player of Object.values(state.players)) {
    player.score = 0;
    player.pairs = 0;
    player.streak = 0;
    player.done = false;
    player.reason = null;
    player.elapsed = null;
  }
  state.seed = seed;
  state.startedAt = now;
  state.status = 'playing';
  state.result = null;
  return [{
    to: 'all',
    msg: {
      t: 'start',
      seed,
      settings: { ...state.settings },
      startedAt: now,
      players: roster(state),
    },
  }];
}

/** Most pairs wins, then the higher score, otherwise a draw. */
function judge(state) {
  const ranked = bySlot(state)
    .filter((p) => p.connected || p.done)
    .sort((a, b) => b.pairs - a.pairs || b.score - a.score);
  const [first, second] = ranked;
  if (!first) return null;
  if (second && second.pairs === first.pairs && second.score === first.score) return null;
  return first.id;
}

function settle(state, winner, reason, now) {
  state.status = 'over';
  state.result = { winner, reason, at: now };
  return [{
    to: 'all',
    msg: { t: 'result', winner, reason, players: roster(state) },
  }];
}

export function handle(state, event) {
  const { type, from, payload = {}, now = 0, nextSeed = 1 } = event ?? {};
  const player = state.players[from];

  switch (type) {
    case 'join': {
      if (player) {
        player.connected = true;
        player.name = cleanName(payload.name, player.name);
      } else {
        const connected = bySlot(state).filter((p) => p.connected).length;
        if (connected >= MAX_PLAYERS) return { state, out: fail(from, 'room_full') };

        // A stale record from someone who closed their tab must not wedge the room.
        if (Object.keys(state.players).length >= MAX_PLAYERS) {
          const stale = bySlot(state).find((p) => !p.connected);
          if (stale) delete state.players[stale.id];
        }

        const slot = freeSlot(state);
        if (slot === null) return { state, out: fail(from, 'room_full') };

        state.players[from] = {
          id: from,
          slot,
          name: cleanName(payload.name, `Player ${slot}`),
          score: 0,
          pairs: 0,
          streak: 0,
          done: false,
          reason: null,
          elapsed: null,
          connected: true,
        };
      }

      if (!state.hostId) state.hostId = from;

      return {
        state,
        out: [
          {
            to: from,
            msg: {
              t: 'welcome',
              you: from,
              code: state.code,
              status: state.status,
              settings: { ...state.settings },
              seed: state.seed,
              startedAt: state.startedAt,
              hostId: state.hostId,
              players: roster(state),
              serverNow: now,
            },
          },
          { to: 'all', msg: peersMsg(state) },
        ],
      };
    }

    case 'leave': {
      if (!player) return { state, out: [] };
      player.connected = false;
      reassignHost(state);
      return {
        state,
        out: [
          { to: 'all', msg: { t: 'peer_left', from, name: player.name } },
          { to: 'all', msg: peersMsg(state) },
        ],
      };
    }

    case 'settings': {
      if (from !== state.hostId) return { state, out: fail(from, 'not_host') };
      if (state.status === 'playing') return { state, out: fail(from, 'in_progress') };
      if (DIFFICULTIES.includes(payload.difficulty)) {
        state.settings.difficulty = payload.difficulty === 'medium' ? 'normal' : payload.difficulty;
      }
      if (CLOCKS.includes(Number(payload.clock))) state.settings.clock = Number(payload.clock);
      if (payload.rules === 'classic' || payload.rules === 'rush') state.settings.rules = payload.rules;
      return { state, out: [{ to: 'all', msg: { t: 'settings', settings: { ...state.settings } } }] };
    }

    case 'start':
    case 'rematch': {
      if (from !== state.hostId) return { state, out: fail(from, 'not_host') };
      const ready = bySlot(state).filter((p) => p.connected).length;
      if (ready < MAX_PLAYERS) return { state, out: fail(from, 'need_two') };
      const seed = type === 'rematch' && payload.sameSeed && state.seed ? state.seed : nextSeed;
      return { state, out: beginRound(state, seed, now) };
    }

    case 'progress': {
      if (!player || state.status !== 'playing') return { state, out: [] };
      player.score = count(payload.score);
      player.pairs = count(payload.pairs);
      player.streak = count(payload.streak);
      return {
        state,
        out: [{
          to: 'others',
          msg: { t: 'progress', from, score: player.score, pairs: player.pairs, streak: player.streak },
        }],
      };
    }

    case 'finish': {
      if (!player || state.status !== 'playing') return { state, out: [] };
      player.score = count(payload.score);
      player.pairs = count(payload.pairs);
      player.elapsed = count(payload.elapsed);
      player.reason = payload.reason === 'cleared' ? 'cleared' : 'timeup';
      player.done = true;

      if (player.reason === 'cleared') return { state, out: settle(state, from, 'cleared', now) };

      const waiting = bySlot(state).some((p) => p.connected && !p.done);
      if (waiting) return { state, out: [] };
      return { state, out: settle(state, judge(state), 'timeup', now) };
    }

    case 'ping':
      return { state, out: [{ to: from, msg: { t: 'pong', serverNow: now } }] };

    default:
      return { state, out: fail(from, 'bad_message', type) };
  }
}
