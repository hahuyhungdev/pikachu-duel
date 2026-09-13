import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';
import * as api from '../leaderboardApi';

vi.mock('../leaderboardApi', () => ({
  getStoredUser: vi.fn(() => null), clearStoredAuth: vi.fn(), fetchMe: vi.fn(), login: vi.fn(), register: vi.fn(),
}));

it('ignores the pending initial session response after logout', async () => {
  let resolve!: (response: Awaited<ReturnType<typeof api.fetchMe>>) => void;
  vi.mocked(api.fetchMe).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useAuth());
  act(() => result.current.logout());
  await act(async () => { resolve({ user: { id: 'old', username: 'Old', avatar: 'pikachu', createdAt: 1 }, stats: { totalPlays: 0, bestScore: 0, bestStage: 0, modes: {} } }); });
  expect(result.current.user).toBeNull();
});
