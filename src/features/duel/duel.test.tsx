import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DuelGame, PRESETS } from './index';
import { calculateNextLevel, normalizeDifficulty } from '../../shared/game/presets.js';
import { ICONS } from '../../game/icons.js';

vi.mock('../../net/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../net/client.js')>();
  return {
    ...actual,
    createRelay: vi.fn().mockImplementation(({ onStatus }) => {
      onStatus?.({ state: 'connecting' });
      return {
        send: vi.fn(),
        sendProgress: vi.fn(),
        close: vi.fn(),
      };
    }),
  };
});

describe('Pikachu Duel React feature', () => {
  it('uses a 16 by 9 Classic board as the default preset', () => {
    expect(PRESETS.normal).toMatchObject({
      label: 'Classic',
      rows: 9,
      cols: 16,
      iconCount: 24,
    });

    render(<DuelGame />);

    const boardSelect = screen.getByRole('combobox', { name: /board/i });
    expect(boardSelect).toHaveValue('normal');
    expect(screen.getByRole('option', { name: /classic.*9 × 16.*24 pokémon/i })).toBeInTheDocument();
  });

  it('renders a React-owned setup flow with solo, local, and online modes', () => {
    render(<DuelGame />);

    expect(screen.getByRole('heading', { name: /pikachu duel/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /solo/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /same computer/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /online/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: /start duel/i })).toBeEnabled();
  });

  it('uses locally bundled canonical Pokémon sprites for every tile identity', () => {
    const classicRoster = [
      'Pikachu',
      'Bulbasaur',
      'Charmander',
      'Squirtle',
      'Raichu',
      'Nidorino',
      'Nidoqueen',
      'Arcanine',
      'Machamp',
      'Gengar',
      'Haunter',
      'Gyarados',
      'Aerodactyl',
      'Mewtwo',
      'Dragonite',
    ];

    expect(ICONS).toHaveLength(24);
    expect(ICONS.map((icon) => icon.label)).toEqual(expect.arrayContaining(classicRoster));
    expect(ICONS.map((icon) => icon.label)).not.toEqual(expect.arrayContaining(['Togepi', 'Mudkip', 'Torchic']));
    expect(ICONS.every((icon) => icon.src.includes('/pokemon/'))).toBe(true);
    expect(ICONS.every((icon) => !('glyph' in icon))).toBe(true);
  });

  it('supports Medium as default difficulty and aliases medium to normal preset', () => {
    expect(PRESETS.medium).toBe(PRESETS.normal);
    expect(normalizeDifficulty('medium')).toBe('normal');
    expect(normalizeDifficulty('easy')).toBe('easy');
    expect(normalizeDifficulty('hard')).toBe('hard');
    expect(normalizeDifficulty('unknown')).toBe('normal');
  });

  it('escalates difficulty level as players level up', () => {
    // Level 1 Easy -> Level 2 Medium (Classic)
    const step1 = calculateNextLevel('easy', 1, 300);
    expect(step1).toEqual({
      level: 2,
      difficulty: 'normal',
      clock: 300,
    });

    // Level 2 Medium -> Level 3 Hard (Grand)
    const step2 = calculateNextLevel('normal', 2, 300);
    expect(step2).toEqual({
      level: 3,
      difficulty: 'hard',
      clock: 300,
    });

    // Level 3 Hard -> Level 4 Hard with tighter clock (-60s)
    const step3 = calculateNextLevel('hard', 3, 300);
    expect(step3).toEqual({
      level: 4,
      difficulty: 'hard',
      clock: 240,
    });

    // Clock tightens down to floor of 60 seconds
    const stepFloor = calculateNextLevel('hard', 7, 60);
    expect(stepFloor).toEqual({
      level: 8,
      difficulty: 'hard',
      clock: 60,
    });
  });

  it('renders progress percent and lead indicators in dual mode', () => {
    const { container } = render(<DuelGame />);
    fireEvent.click(screen.getByRole('button', { name: /start duel/i }));

    const p1 = container.querySelector('[data-player="1"]')!;
    const p2 = container.querySelector('[data-player="2"]')!;

    expect(p1.querySelector('[data-role="progress-percent"]')).toHaveTextContent('0');
    expect(p2.querySelector('[data-role="progress-percent"]')).toHaveTextContent('0');

    // Trigger hint on P1 and clear pair
    fireEvent.click(within(p1 as HTMLElement).getByRole('button', { name: /hint/i }));
    const hintTiles = p1.querySelectorAll('.tile[data-hint="true"]');
    expect(hintTiles).toHaveLength(2);
    fireEvent.click(hintTiles[0]);
    fireEvent.click(hintTiles[1]);

    // P1 cleared 1 of 72 pairs (~1%), leads P2
    expect(p1.querySelector('[data-role="progress-percent"]')).toHaveTextContent('1');
    expect(p1.querySelector('[data-role="lead-indicator"]')).toHaveTextContent(/LEAD/i);
    expect(p2.querySelector('[data-role="lead-indicator"]')).toHaveTextContent(/▼/);
  });

  it('validates online room code and enters lobby upon valid submission', () => {
    render(<DuelGame />);

    // Switch to Online mode tab
    const onlineTab = screen.getByRole('tab', { name: /online/i });
    fireEvent.click(onlineTab);
    expect(onlineTab).toHaveAttribute('aria-selected', 'true');

    const nameInput = screen.getByPlaceholderText(/ash/i);
    const roomInput = screen.getByPlaceholderText(/leave blank to create a room/i);
    const joinBtn = screen.getByRole('button', { name: /create or join room/i });

    // Set player name and invalid 3-character room code '123'
    fireEvent.change(nameInput, { target: { value: 'huyhung' } });
    fireEvent.change(roomInput, { target: { value: '123' } });
    fireEvent.click(joinBtn);

    // Shows validation error message
    expect(
      screen.getByText(/room code must be 4–12 letters or numbers/i),
    ).toBeInTheDocument();

    // Typing in room input clears error
    fireEvent.change(roomInput, { target: { value: '1234' } });
    expect(
      screen.queryByText(/room code must be 4–12 letters or numbers/i),
    ).not.toBeInTheDocument();

    // Clicking join with valid 4-character code opens lobby
    fireEvent.click(joinBtn);

    expect(screen.getByRole('heading', { name: /room 1234/i })).toBeInTheDocument();
    expect(screen.getByText('huyhung')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('generates a 6-character room code when room code is left blank', () => {
    render(<DuelGame />);

    fireEvent.click(screen.getByRole('tab', { name: /online/i }));
    const nameInput = screen.getByPlaceholderText(/ash/i);
    const joinBtn = screen.getByRole('button', { name: /create or join room/i });

    fireEvent.change(nameInput, { target: { value: 'huyhung' } });
    fireEvent.click(joinBtn);

    const roomHeading = screen.getByRole('heading', { name: /room [A-Z0-9]{6}/i });
    expect(roomHeading).toBeInTheDocument();
  });
});

