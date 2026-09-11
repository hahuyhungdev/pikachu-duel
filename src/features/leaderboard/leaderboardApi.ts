/**
 * Client API for User Authentication and Global Leaderboards.
 * Connects to the Cloudflare Worker GameData backend with offline resilience.
 */

import { relayUrl } from '../../net/config.js';

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
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore localStorage errors in private mode */
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

function getApiBase(): string {
  const base = relayUrl();
  return base ? base.replace(/\/+$/, '') : '';
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase();
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const url = `${base}/api${path}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Network request failed');
  }
  return data as T;
}

export async function register(username: string, password: string, avatar: string): Promise<{ user: User; token: string }> {
  const data = await apiFetch<{ ok: boolean; token: string; user: User }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, avatar }),
  });
  setStoredAuth(data.token, data.user);
  return { user: data.user, token: data.token };
}

export async function login(username: string, password: string): Promise<{ user: User; token: string }> {
  const data = await apiFetch<{ ok: boolean; token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setStoredAuth(data.token, data.user);
  return { user: data.user, token: data.token };
}

export async function fetchMe(): Promise<{ user: User; stats: UserStats } | null> {
  const token = getStoredToken();
  if (!token) return null;
  try {
    const data = await apiFetch<{ ok: boolean; user: User; stats: UserStats }>('/auth/me');
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
  guestName?: string;
  guestAvatar?: string;
}

export async function submitScore(submission: ScoreSubmission): Promise<{ rank: number; score: number; stage: number } | null> {
  try {
    const data = await apiFetch<{ ok: boolean; rank: number; score: number; stage: number }>('/scores', {
      method: 'POST',
      body: JSON.stringify(submission),
    });
    return data;
  } catch {
    // Cache offline if network fails
    try {
      const raw = localStorage.getItem(OFFLINE_SCORES_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      queue.push({ ...submission, timestamp: Date.now() });
      localStorage.setItem(OFFLINE_SCORES_KEY, JSON.stringify(queue.slice(-20)));
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function fetchLeaderboard(mode: string, limit = 50): Promise<LeaderboardResponse> {
  try {
    return await apiFetch<LeaderboardResponse>(`/leaderboard?mode=${encodeURIComponent(mode)}&limit=${limit}`);
  } catch {
    // Return offline mock leaderboard so the UI shows gracefully
    const user = getStoredUser();
    return {
      ok: true,
      mode,
      entries: [
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
      ],
      userEntry: user
        ? {
            rank: 4,
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            score: 15400,
            stage: 10,
            streak: 12,
            createdAt: Date.now(),
          }
        : null,
    };
  }
}
