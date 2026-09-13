/**
 * WebSocket signaling client for real-time multiplayer duels.
 *
 * Implements exponential backoff reconnects, periodic heartbeat keep-alives,
 * throttled game progress broadcasting, and tab-level session persistence.
 */

import { relayUrl } from './config.ts';

/** Session storage key used for persisting client player identity across reloads. */
export const ID_STORE_KEY = 'pikachu-duel/player-id';

/** Exponential backoff retry intervals in milliseconds. */
export const BACKOFF_INTERVALS_MS = [500, 1000, 2000, 4000, 8000] as const;

/** Heartbeat ping interval to keep edge connections alive. */
export const HEARTBEAT_INTERVAL_MS = 25000;

/** Throttle duration in milliseconds for progress broadcasting. (~4 frames/sec). */
export const PROGRESS_THROTTLE_MS = 250;

/** Normal closure status code. */
export const WS_CLOSE_NORMAL = 1000;

/** Custom closure code signaling that connection was replaced by a newer browser tab. */
export const WS_CLOSE_REPLACED = 4000;

/** Lifecycle connection state of the relay socket. */
export type RelayConnectionState =
  | 'unconfigured'
  | 'connecting'
  | 'reconnecting'
  | 'open'
  | 'dropped'
  | 'error';

/** Status notification dispatched on connection state transitions. */
export interface RelayStatusEvent {
  state: RelayConnectionState;
  code?: number;
}

/** Options for creating a duel relay connection. */
export interface RelayClientOptions {
  code: string;
  name: string;
  onMessage: (message: Record<string, unknown>) => void;
  onStatus?: (status: RelayStatusEvent) => void;
}

/** Interface of the initialized duel relay client. */
export interface RelayClient {
  readonly id: string;
  send: (message: Record<string, unknown>) => boolean;
  pushProgress: (stats: Record<string, unknown>) => void;
  rename: (next: string) => void;
  flush: () => void;
  close: () => void;
}

/**
 * Returns a stable UUID per browser tab, ensuring a page refresh reclaims the same slot.
 *
 * @returns UUID string identifier.
 */
export function playerId(): string {
  try {
    let id = sessionStorage.getItem(ID_STORE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ID_STORE_KEY, id);
    }
    return id;
  } catch {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `player-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/**
 * Connects to the Cloudflare Worker relay room via WebSocket.
 *
 * @param options - Room code, display name, and event handlers.
 * @returns Active `RelayClient` controller.
 */
export function createRelay({
  code,
  name,
  onMessage,
  onStatus = () => {},
}: RelayClientOptions): RelayClient {
  const id = playerId();
  let socket: WebSocket | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let beatTimer: ReturnType<typeof setInterval> | null = null;
  let progressTimer: ReturnType<typeof setTimeout> | null = null;
  let queuedProgress: Record<string, unknown> | null = null;
  let displayName = name;
  let shutDown = false;

  function stopTimers(): void {
    if (retryTimer) clearTimeout(retryTimer);
    if (beatTimer) clearInterval(beatTimer);
    if (progressTimer) clearTimeout(progressTimer);
    retryTimer = beatTimer = progressTimer = null;
  }

  function send(message: Record<string, unknown>): boolean {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function connect(): void {
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
      beatTimer = setInterval(() => send({ t: 'ping' }), HEARTBEAT_INTERVAL_MS);
      onStatus({ state: 'open' });
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.t === 'pong') return;
      onMessage(message);
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (beatTimer) {
        clearInterval(beatTimer);
        beatTimer = null;
      }
      if (shutDown || event.code === WS_CLOSE_REPLACED) return;
      onStatus({ state: 'dropped', code: event.code });
      const wait = BACKOFF_INTERVALS_MS[Math.min(attempt, BACKOFF_INTERVALS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, wait);
    });

    socket.addEventListener('error', () => onStatus({ state: 'error' }));
  }

  function pushProgress(stats: Record<string, unknown>): void {
    queuedProgress = stats;
    if (progressTimer) return;
    progressTimer = setTimeout(() => {
      progressTimer = null;
      if (queuedProgress) {
        send({ t: 'progress', ...queuedProgress });
      }
      queuedProgress = null;
    }, PROGRESS_THROTTLE_MS);
  }

  connect();

  return {
    id,
    send,
    pushProgress,
    rename(next: string): void {
      displayName = next;
    },
    flush(): void {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      if (queuedProgress) {
        send({ t: 'progress', ...queuedProgress });
      }
      queuedProgress = null;
    },
    close(): void {
      shutDown = true;
      stopTimers();
      try {
        socket?.close(WS_CLOSE_NORMAL, 'bye');
      } catch {
        /* already closed */
      }
    },
  };
}
