/**
 * Client API for User Authentication and Global Leaderboards.
 * Connects to the Cloudflare Worker GameData backend with offline resilience.
 */

import { RELAY_URL } from '../../net/config.js';
import type { Profile } from '../../shared/game/profile';

export interface User {
  id: string;
  username: string;
  avatar: string;
  createdAt: number;
}

export interface UserStats {
  totalPlays: number;
  bestScore: number;
  bestStage: number;
  modes: Record<string, { bestScore: number; bestStage: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  score: number;
  stage: number;
  streak: number;
  createdAt: number;
}

export interface LeaderboardResponse {
  ok: boolean;
  mode: string;
  entries: LeaderboardEntry[];
  userEntry?: LeaderboardEntry | null;
  error?: string;
  message?: string;
}

const TOKEN_KEY = 'pikachu/auth_token';
const USER_KEY = 'pikachu/auth_user';
const OFFLINE_SCORES_KEY = 'pikachu/offline_scores';
let authRevision = 0;

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: User): void {
  authRevision += 1;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore localStorage errors in private mode */
  }
}

export function clearStoredAuth(): void {
  authRevision += 1;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

function getApiBase(): string {
  // Room invite links may select a relay, but must never select where passwords
  // and account tokens are sent. Only local development can use a local override.
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];
  const override = new URLSearchParams(location.search).get('server');
  if (override && localHosts.includes(location.hostname)) {
    try {
      const url = new URL(override);
      if (localHosts.includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)
        && !url.username && !url.password) return url.origin;
    } catch { /* Untrusted query values fall back to the configured backend. */ }
  }
  return RELAY_URL.replace(/\/+$/, '');
}

async function apiFetch<T>(path: string, options: RequestInit = {}, authToken = getStoredToken()): Promise<T> {
  const base = getApiBase();
  const token = authToken;
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = `${base}/api${path}`;
  const response = await fetch(url, { ...options, headers, redirect: 'error' });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Network request failed');
  }
  return data as T;
}

export interface AccountProgressResponse {
  userId: string;
  profile: Profile;
}

export function fetchAccountProgress(token: string, signal?: AbortSignal): Promise<AccountProgressResponse> {
  return apiFetch('/progress', { signal, cache: 'no-store' }, token);
}

export function putAccountProgress(profile: Profile, token: string, signal?: AbortSignal): Promise<AccountProgressResponse> {
  return apiFetch('/progress', { method: 'PUT', body: JSON.stringify({ profile }), signal }, token);
}

export async function register(username: string, password: string, avatar: string): Promise<{ user: User; token: string }> {
  const revision = ++authRevision;
  const data = await apiFetch<{ ok: boolean; token: string; user: User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, avatar }),
  });
  if (revision !== authRevision) throw new Error('Session changed');
  setStoredAuth(data.token, data.user);
  return { user: data.user, token: data.token };
}

export async function login(username: string, password: string): Promise<{ user: User; token: string }> {
  const revision = ++authRevision;
  const data = await apiFetch<{ ok: boolean; token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (revision !== authRevision) throw new Error('Session changed');
  setStoredAuth(data.token, data.user);
  return { user: data.user, token: data.token };
}

export async function fetchMe(): Promise<{ user: User; stats: UserStats } | null> {
  const token = getStoredToken();
  const revision = authRevision;
  if (!token) return null;
  try {
    const data = await apiFetch<{ ok: boolean; user: User; stats: UserStats }>('/auth/me');
    if (revision !== authRevision || getStoredToken() !== token) return null;
    setStoredAuth(token, data.user);
    return data;
  } catch {
    return null;
  }
}

export interface ScoreSubmission {
  mode: string;
  score: number;
  stage: number;
  streak: number;
  pairs: number;
  guestId?: string;
  guestName?: string;
  guestAvatar?: string;
}

const GUEST_ID_KEY = 'pikachu/guest_id';

export function getOrCreateGuestId(): string {
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id || !/^guest_[a-zA-Z0-9_-]{8,36}$/.test(id)) {
      const rand = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
      id = `guest_${rand}`;
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    return `guest_${Date.now()}`;
  }
}

export async function submitScore(submission: ScoreSubmission): Promise<{ rank: number; score: number; stage: number } | null> {
  const token = getStoredToken();
  const guestId = !token ? getOrCreateGuestId() : undefined;
  const payload: ScoreSubmission = {
    ...submission,
    ...(guestId && !submission.guestId ? { guestId, guestName: submission.guestName || 'Khách' } : {}),
  };

  try {
    const data = await apiFetch<{ ok: boolean; rank: number; score: number; stage: number }>('/scores', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  } catch {
    // Cache offline if network fails
    try {
      const raw = localStorage.getItem(OFFLINE_SCORES_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({ ...payload, timestamp: Date.now() });
      localStorage.setItem(OFFLINE_SCORES_KEY, JSON.stringify(queue.slice(-20)));
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function fetchLeaderboard(mode: string, limit = 50): Promise<LeaderboardResponse> {
  const token = getStoredToken();
  const guestParam = !token ? `&guestId=${encodeURIComponent(getOrCreateGuestId())}` : '';
  try {
    return await apiFetch<LeaderboardResponse>(`/leaderboard?mode=${encodeURIComponent(mode)}&limit=${limit}${guestParam}`);
  } catch {
    // Return offline mock leaderboard integrated with actual local profile records
    const user = getStoredUser();
    let userRecord = { bestScore: 0, bestStage: 0, bestStreak: 0 };
    try {
      const raw = localStorage.getItem('pikachu-duel/profile');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.modes?.[mode]) {
          userRecord = parsed.modes[mode];
        }
      }
    } catch {
      /* ignore */
    }

    const mockBots: LeaderboardEntry[] = [
      {
        rank: 1,
        userId: 'bot_red',
        username: 'RedChampion',
        avatar: 'charizard',
        score: 28500,
        stage: 18,
        streak: 24,
        createdAt: Date.now() - 3600000 * 5,
      },
      {
        rank: 2,
        userId: 'bot_blue',
        username: 'BlueRival',
        avatar: 'blastoise',
        score: 24200,
        stage: 15,
        streak: 19,
        createdAt: Date.now() - 3600000 * 12,
      },
      {
        rank: 3,
        userId: 'bot_yellow',
        username: 'PikaVolt',
        avatar: 'pikachu',
        score: 21800,
        stage: 14,
        streak: 17,
        createdAt: Date.now() - 3600000 * 20,
      },
    ];

    const hasLocalProgress = userRecord.bestStage > 0 || userRecord.bestScore > 0;
    let userEntry: LeaderboardEntry | null = null;
    let entries = [...mockBots];

    if (hasLocalProgress) {
      userEntry = {
        rank: 0,
        userId: user ? user.id : getOrCreateGuestId(),
        username: user ? user.username : 'Bạn (Thiết bị này)',
        avatar: user ? user.avatar : 'pikachu',
        score: userRecord.bestScore,
        stage: userRecord.bestStage,
        streak: userRecord.bestStreak,
        createdAt: Date.now(),
      };

      entries.push(userEntry);
      entries.sort((a, b) => {
        if (mode === 'adventure' && b.stage !== a.stage) return b.stage - a.stage;
        return b.score - a.score;
      });

      entries = entries.map((item, idx) => {
        const ranked = { ...item, rank: idx + 1 };
        if (ranked.userId === userEntry!.userId) {
          userEntry = ranked;
        }
        return ranked;
      });
    }

    return {
      ok: true,
      mode,
      entries,
      userEntry,
    };
  }
}

/**
 * Syncs any local personal bests to the leaderboard server
 * (e.g. from previous runs or offline play).
 */
export async function syncLocalBests(): Promise<void> {
  try {
    const raw = localStorage.getItem('pikachu-duel/profile');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const modes = ['adventure', 'timeattack', 'classic', 'daily'];
    for (const mode of modes) {
      const rec = parsed?.modes?.[mode];
      if (rec && (rec.bestStage > 1 || rec.bestScore > 0)) {
        await submitScore({
          mode,
          score: rec.bestScore || 0,
          stage: rec.bestStage || 1,
          streak: rec.bestStreak || 0,
          pairs: 0,
        });
      }
    }
  } catch {
    /* ignore sync failures */
  }
}
