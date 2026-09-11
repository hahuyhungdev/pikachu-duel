/**
 * Pikachu Duel relay.
 *
 * One Durable Object per room code holds the room state and the two open
 * WebSockets. All the rules live in room.js; this file only moves bytes:
 * socket -> event -> state machine -> addressed messages -> sockets.
 *
 * Sockets are hibernatable, so an idle room costs nothing while it waits.
 */

import { createRoom, handle } from './room.js';
import { GameData } from './gameData.js';

export { GameData };

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const CODE_PATTERN = /^[A-Z0-9]{4,12}$/;
const MAX_FRAME_BYTES = 4096;
const RATE_LIMIT = { windowMs: 1000, max: 40 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });

/** Only our own front-ends may use this relay. */
function originAllowed(origin, env) {
  if (!origin) return true; // native clients and curl send none
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (extra.includes(origin)) return true;
  let host;
  try {
    ({ hostname: host } = new URL(origin));
  } catch {
    return false;
  }
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.github.io');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/health') return json({ ok: true, service: 'pikachu-duel-room' });

    // Forward /api/* requests to GameData Durable Object
    if (url.pathname.startsWith('/api/')) {
      if (env.GAME_DATA) {
        const dataId = env.GAME_DATA.idFromName('global');
        const gameData = env.GAME_DATA.get(dataId);
        return gameData.fetch(request);
      }
      return json({ error: 'service_unavailable', message: 'GAME_DATA binding not found' }, 503);
    }

    const match = url.pathname.match(/^\/room\/([^/]+)$/);
    if (!match) return json({ error: 'not_found' }, 404);

    const code = decodeURIComponent(match[1]).toUpperCase();
    if (!CODE_PATTERN.test(code)) return json({ error: 'bad_code' }, 400);

    // Reject an unauthorised origin before anything else looks at the request.
    if (!originAllowed(request.headers.get('Origin'), env)) {
      return json({ error: 'origin_not_allowed' }, 403);
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'expected_websocket' }, 426);
    }

    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(new Request(`https://room/${code}`, request));
  },
};

export class DuelRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.rate = new Map();
  }

  async load(code) {
    if (!this.room) {
      this.room = (await this.ctx.storage.get('room')) ?? createRoom(code);
    }
    return this.room;
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
  }

  async fetch(request) {
    const code = new URL(request.url).pathname.slice(1).toUpperCase();
    await this.load(code);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  socketFor(id) {
    return this.ctx.getWebSockets().find((ws) => this.idOf(ws) === id) ?? null;
  }

  idOf(ws) {
    try {
      return ws.deserializeAttachment()?.id ?? null;
    } catch {
      return null;
    }
  }

  deliver(out, senderId) {
    for (const { to, msg } of out) {
      const body = JSON.stringify(msg);
      if (to === 'all' || to === 'others') {
        for (const ws of this.ctx.getWebSockets()) {
          const id = this.idOf(ws);
          if (!id) continue; // hasn't joined yet: not part of the room
          if (to === 'others' && id === senderId) continue;
          try {
            ws.send(body);
          } catch {
            /* socket already gone; the close handler will clean up */
          }
        }
        continue;
      }
      const target = this.socketFor(to) ?? (to === senderId ? this.pending : null);
      try {
        target?.send(body);
      } catch {
        /* ignore */
      }
    }
  }

  /** Cheap per-socket flood guard. */
  throttled(id, now) {
    const seen = this.rate.get(id);
    if (!seen || now - seen.start > RATE_LIMIT.windowMs) {
      this.rate.set(id, { start: now, count: 1 });
      return false;
    }
    seen.count += 1;
    return seen.count > RATE_LIMIT.max;
  }

  nextSeed() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] >>> 1) + 1;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FRAME_BYTES) {
      ws.send(JSON.stringify({ t: 'error', code: 'bad_frame' }));
      return;
    }

    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ t: 'error', code: 'bad_json' }));
      return;
    }

    const now = Date.now();
    let id = this.idOf(ws);

    // The client presents its own stable id so a refresh keeps its slot.
    if (!id) {
      if (message.t !== 'join' || !ID_PATTERN.test(String(message.playerId ?? ''))) {
        ws.send(JSON.stringify({ t: 'error', code: 'not_joined' }));
        return;
      }
      id = String(message.playerId);
      const existing = this.socketFor(id);
      if (existing && existing !== ws) {
        try {
          existing.close(4000, 'replaced');
        } catch {
          /* ignore */
        }
      }
      ws.serializeAttachment({ id });
    }

    if (this.throttled(id, now)) {
      ws.close(4001, 'too_fast');
      return;
    }

    await this.load();
    this.pending = ws; // so an error reply reaches a socket that has no id yet

    const { state, out } = handle(this.room, {
      type: message.t,
      from: id,
      payload: message,
      now,
      nextSeed: this.nextSeed(),
    });

    this.room = state;
    await this.save();
    this.deliver(out, id);
    this.pending = null;
  }

  async onGone(ws) {
    const id = this.idOf(ws);
    if (!id) return;
    this.rate.delete(id);
    await this.load();
    const { state, out } = handle(this.room, { type: 'leave', from: id, now: Date.now() });
    this.room = state;
    await this.save();
    this.deliver(out, id);
  }

  async webSocketClose(ws) {
    await this.onGone(ws);
  }

  async webSocketError(ws) {
    await this.onGone(ws);
  }
}
