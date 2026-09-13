import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProfile, recordRun, saveProfile } from '../../../shared/game/profile';
import { useAccountProgress } from './useAccountProgress';
import * as api from '../leaderboardApi';

vi.mock('../leaderboardApi', () => ({
  getStoredToken: vi.fn(() => 'token-a'),
  fetchAccountProgress: vi.fn(),
  putAccountProgress: vi.fn(),
}));
const user = { id: 'a', username: 'A', avatar: 'pikachu', createdAt: 1 };

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api.getStoredToken).mockReturnValue('token-a');
  vi.mocked(api.fetchAccountProgress).mockResolvedValue({ userId: 'a', profile: loadProfile() });
  vi.mocked(api.putAccountProgress).mockImplementation(async (profile) => ({ userId: 'a', profile }));
});

describe('useAccountProgress', () => {
  it('restores account records and syncs subsequent completed runs without importing guest history', async () => {
    const remote = loadProfile();
    remote.modes.adventure.bestStage = 7;
    remote.stageStars = { 6: 3 };
    vi.mocked(api.fetchAccountProgress).mockResolvedValue({ userId: 'a', profile: remote });
    const guest = loadProfile();
    guest.totalPairs = 999;
    saveProfile(guest);
    const { result } = renderHook(() => useAccountProgress(user));
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(result.current.profile.modes.adventure.bestStage).toBe(7);
    expect(result.current.profile.totalPairs).toBe(0);
    act(() => { recordRun({ mode: 'classic', score: 900, stage: 1, bestStreak: 3, pairs: 8 }, undefined, 'a'); });
    await waitFor(() => expect(result.current.profile.totalPairs).toBe(8));
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(api.putAccountProgress).toHaveBeenLastCalledWith(expect.objectContaining({ totalPairs: 8 }), 'token-a', expect.any(AbortSignal));
    expect(loadProfile().totalPairs).toBe(999);
  });

  it('keeps local progress on network errors and retries explicitly', async () => {
    vi.mocked(api.fetchAccountProgress).mockRejectedValueOnce(new Error('offline'));
    recordRun({ mode: 'classic', score: 300, stage: 1, bestStreak: 2, pairs: 4 }, undefined, 'a');
    const { result } = renderHook(() => useAccountProgress(user));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.profile.totalPairs).toBe(4);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(result.current.profile.totalPairs).toBe(4);
  });

  it('discards stale account responses after switching users', async () => {
    let resolveOld!: (value: { userId: string; profile: ReturnType<typeof loadProfile> }) => void;
    vi.mocked(api.fetchAccountProgress).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ account }) => useAccountProgress(account), { initialProps: { account: user } });
    await waitFor(() => expect(api.fetchAccountProgress).toHaveBeenCalled());
    vi.mocked(api.getStoredToken).mockReturnValue('token-b');
    vi.mocked(api.fetchAccountProgress).mockResolvedValue({ userId: 'b', profile: loadProfile() });
    vi.mocked(api.putAccountProgress).mockImplementation(async (profile) => ({ userId: 'b', profile }));
    rerender({ account: { ...user, id: 'b' } });
    await waitFor(() => expect(result.current.status).toBe('synced'));
    const stale = loadProfile();
    stale.totalPairs = 800;
    await act(async () => { resolveOld({ userId: 'a', profile: stale }); });
    expect(result.current.profile.totalPairs).toBe(0);
    expect(loadProfile('b').totalPairs).toBe(0);
    expect(loadProfile('a').totalPairs).toBe(0);
  });

  it('keeps guest mode local and never uploads without an account', async () => {
    const { result } = renderHook(() => useAccountProgress(null));
    act(() => { recordRun({ mode: 'zen', score: 20, stage: 1, bestStreak: 1, pairs: 2 }); });
    await waitFor(() => expect(result.current.profile.totalPairs).toBe(2));
    expect(result.current.status).toBe('local');
    expect(api.fetchAccountProgress).not.toHaveBeenCalled();
    expect(api.putAccountProgress).not.toHaveBeenCalled();
  });

  it('keeps a run finished during upload and sends it before claiming synced', async () => {
    let resolveUpload!: (value: { userId: string; profile: ReturnType<typeof loadProfile> }) => void;
    vi.mocked(api.putAccountProgress).mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve; }));
    const { result } = renderHook(() => useAccountProgress(user));
    await waitFor(() => expect(api.putAccountProgress).toHaveBeenCalledTimes(1));
    act(() => { recordRun({ mode: 'classic', score: 500, stage: 1, bestStreak: 2, pairs: 7 }, undefined, 'a'); });
    await act(async () => { resolveUpload({ userId: 'a', profile: loadProfile() }); });
    await waitFor(() => expect(result.current.status).toBe('synced'));
    expect(api.putAccountProgress).toHaveBeenCalledTimes(2);
    expect(loadProfile('a').totalPairs).toBe(7);
    expect(result.current.profile.modes.classic.bestScore).toBe(500);
  });

  it('reports an expired account session without moving its progress to guest storage', async () => {
    vi.mocked(api.fetchAccountProgress).mockRejectedValue(new Error('unauthorized'));
    recordRun({ mode: 'adventure', score: 400, stage: 2, bestStreak: 2, pairs: 5 }, undefined, 'a');
    const { result } = renderHook(() => useAccountProgress(user));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.profile.totalPairs).toBe(5);
    expect(loadProfile().totalPairs).toBe(0);
    expect(api.putAccountProgress).not.toHaveBeenCalled();
  });
});
