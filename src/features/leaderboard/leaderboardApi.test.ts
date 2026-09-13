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
