import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SoloGame } from './index';
import { useSolo } from './hooks/useSolo';
import { loadProfile, saveProfile } from '../../shared/game/profile';
import { findAnyMove } from '../../game/connect.js';

beforeEach(() => { localStorage.clear(); });

it('uses the signed-in account records instead of another browser profile', () => {
  const guest = loadProfile();
  guest.modes.adventure.bestStage = 99;
  saveProfile(guest);
  const account = loadProfile('ash');
  account.modes.adventure.bestStage = 7;
  saveProfile(account, 'ash');
  localStorage.setItem('pikachu/auth_user', JSON.stringify({ id: 'ash', username: 'Ash', avatar: 'pikachu', createdAt: 1 }));
  localStorage.setItem('pikachu/auth_token', 'test-token');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
  const { container } = render(<SoloGame onOpenDuel={() => {}} />);
  expect(container.querySelector('[data-mode="adventure"] .mode-card__best-value')).toHaveTextContent('7');
  fireEvent.click(screen.getByRole('button', { name: /player account|tài khoản người chơi/i }));
  fireEvent.click(screen.getByRole('button', { name: /log out|đăng xuất/i }));
  expect(container.querySelector('[data-mode="adventure"] .mode-card__best-value')).toHaveTextContent('99');
  vi.restoreAllMocks();
});

it('saves an Adventure stage immediately, before the run ends', async () => {
  const { result } = renderHook(() => useSolo());
  act(() => result.current.startRun());
  act(() => result.current.beginStage());
  for (let step = 0; step < 24; step++) {
    const move = findAnyMove(result.current.board!.session.board)!;
    act(() => result.current.pick(move.a.r, move.a.c));
    act(() => result.current.pick(move.b.r, move.b.c));
  }
  await waitFor(() => expect(result.current.phase).toBe('cleared'));
  expect(loadProfile().stageStars['1']).toBeGreaterThan(0);
  expect(loadProfile().totalPlays).toBe(0);
});

it('resumes at the saved bestStage by default in Adventure mode', () => {
  const profile = loadProfile();
  profile.modes.adventure.bestStage = 5;
  saveProfile(profile);

  const { result } = renderHook(() => useSolo());
  expect(result.current.profileSummary.adventureBestStage).toBe(5);
  act(() => result.current.startRun());
  expect(result.current.round?.stage).toBe(5);
});

it('allows starting from Stage 1 even if a higher stage was reached', () => {
  const profile = loadProfile();
  profile.modes.adventure.bestStage = 5;
  saveProfile(profile);

  const { result } = renderHook(() => useSolo());
  act(() => result.current.startRun(1));
  expect(result.current.round?.stage).toBe(1);
});

