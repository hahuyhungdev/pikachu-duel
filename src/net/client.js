/** WebSocket client for the duel relay: reconnects, heartbeats, throttles. */

import { relayUrl } from './config.js';

const ID_STORE = 'pikachu-duel/player-id';
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000];
const HEARTBEAT_MS = 25000;
const PROGRESS_MS = 250;

/** A stable id per browser tab, so a refresh reclaims the same slot. */
export function playerId() {
  try {
    let id = sessionStorage.getItem(ID_STORE);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ID_STORE, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function createRelay({ code, name, onMessage, onStatus = () => {} }) {
  const id = playerId();
  let socket = null;
  let attempt = 0;
  let retryTimer = null;
  let beatTimer = null;
  let progressTimer = null;
  let queuedProgress = null;
  let displayName = name;
  let shutDown = false;

  function stopTimers() {
    clearTimeout(retryTimer);
    clearInterval(beatTimer);
    clearTimeout(progressTimer);
    retryTimer = beatTimer = progressTimer = null;
  }

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function connect() {
    const base = relayUrl();
    if (!base) {
      onStatus({ state: 'unconfigured' });
      return;
    }

    onStatus({ state: attempt === 0 ? 'connecting' : 'reconnecting' });
    socket = new WebSocket(`${base.replace(/^http/, 'ws')}/room/${encodeURIComponent(code)}`);

    socket.addEventListener('open', () => {
      attempt = 0;
      send({ t: 'join', playerId: id, name: displayName });
      beatTimer = setInterval(() => send({ t: 'ping' }), HEARTBEAT_MS);
      onStatus({ state: 'open' });
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.t === 'pong') return;
      onMessage(message);
    });

    socket.addEventListener('close', (event) => {
      clearInterval(beatTimer);
      beatTimer = null;
      if (shutDown || event.code === 4000) return; // 4000: replaced by a newer tab
      onStatus({ state: 'dropped', code: event.code });
      const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, wait);
    });

    socket.addEventListener('error', () => onStatus({ state: 'error' }));
  }

  /** Progress fires on every match; coalesce it so we send ~4 frames a second. */
  function pushProgress(stats) {
    queuedProgress = stats;
    if (progressTimer) return;
    progressTimer = setTimeout(() => {
      progressTimer = null;
      if (queuedProgress) send({ t: 'progress', ...queuedProgress });
      queuedProgress = null;
    }, PROGRESS_MS);
  }

  connect();

  return {
    id,
    send,
    pushProgress,
    rename(next) {
      displayName = next;
    },
    flush() {
      clearTimeout(progressTimer);
      progressTimer = null;
      if (queuedProgress) send({ t: 'progress', ...queuedProgress });
      queuedProgress = null;
    },
    close() {
      shutDown = true;
      stopTimers();
      try {
        socket?.close(1000, 'bye');
      } catch {
        /* already closed */
      }
    },
  };
}
