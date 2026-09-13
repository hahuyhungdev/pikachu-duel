import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearStoredAuth, fetchAccountProgress, fetchMe, getStoredToken, login, setStoredAuth } from './leaderboardApi';
import { RELAY_URL } from '../../net/config.js';

const user = { id: 'a', username: 'A', avatar: 'pikachu', createdAt: 1 };
beforeEach(() => { localStorage.clear(); setStoredAuth('token-a', user); });
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

it('never sends account tokens to an arbitrary server query override', async () => {
  window.history.replaceState({}, '', '/?server=https://attacker.example');
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ userId: 'a', profile: {} })));
  vi.stubGlobal('fetch', fetch);
  await fetchAccountProgress('token-a');
  expect(fetch.mock.calls[0][0]).toBe(`${RELAY_URL}/api/progress`);
  expect(fetch.mock.calls[0][1].redirect).toBe('error');
});

it('does not restore credentials from a stale me response after logout', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  const pending = fetchMe();
  clearStoredAuth();
  resolve(new Response(JSON.stringify({ user, stats: {} })));
  expect(await pending).toBeNull();
  expect(getStoredToken()).toBeNull();
});

it('exposes expired-session progress failures instead of treating them as guest saves', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })));
  await expect(fetchAccountProgress('token-a')).rejects.toThrow('unauthorized');
});

it('does not store a login that completed after logout', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  const pending = login('A', 'password');
  clearStoredAuth();
  resolve(new Response(JSON.stringify({ user, token: 'new-token' })));
  await expect(pending).rejects.toThrow('Session changed');
  expect(getStoredToken()).toBeNull();
});

it('incorporates local stage 16 record in offline leaderboard fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
  localStorage.setItem(
    'pikachu-duel/profile',
    JSON.stringify({
      modes: {
        adventure: { bestStage: 16, bestScore: 25000, bestStreak: 15 },
      },
    }),
  );

  const { fetchLeaderboard } = await import('./leaderboardApi');
  const result = await fetchLeaderboard('adventure');

  expect(result.ok).toBe(true);
  expect(result.userEntry).not.toBeNull();
  expect(result.userEntry?.stage).toBe(16);
  expect(result.userEntry?.score).toBe(25000);
  expect(result.userEntry?.rank).toBe(2); // Bot Red is stage 18, so user stage 16 is rank 2
});

it('syncLocalBests submits local stage record', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, rank: 1 })));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem(
    'pikachu-duel/profile',
    JSON.stringify({
      modes: {
        adventure: { bestStage: 16, bestScore: 25000, bestStreak: 15 },
      },
    }),
  );

  const { syncLocalBests } = await import('./leaderboardApi');
  await syncLocalBests();

  expect(fetchMock).toHaveBeenCalled();
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/scores'));
  expect(call).toBeDefined();
  const body = JSON.parse(call![1].body);
  expect(body.mode).toBe('adventure');
  expect(body.stage).toBe(16);
  expect(body.score).toBe(25000);
});
