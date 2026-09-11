import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DuelGame, PRESETS } from './index';
import { calculateNextLevel, normalizeDifficulty } from '../../shared/game/presets.js';
import { ICONS } from '../../game/icons.js';

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
});
