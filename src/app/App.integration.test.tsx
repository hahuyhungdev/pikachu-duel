import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import App from '../App';

function startDuel() {
  const result = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /start duel/i }));

  const playerOne = result.container.querySelector<HTMLElement>('[data-player="1"]');
  const playerTwo = result.container.querySelector<HTMLElement>('[data-player="2"]');

  expect(playerOne).not.toBeNull();
  expect(playerTwo).not.toBeNull();

  return {
    ...result,
    playerOne: playerOne!,
    playerTwo: playerTwo!,
  };
}

function tiles(player: HTMLElement) {
  return [...player.querySelectorAll<HTMLButtonElement>('.tile:not([data-empty="true"])')];
}

describe('App core duel interactions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('starts the default 16 x 9 duel and clears a hinted pair through real tile clicks', async () => {
    const { playerOne, playerTwo } = startDuel();

    expect(tiles(playerOne)).toHaveLength(144);
    expect(tiles(playerTwo)).toHaveLength(144);
    expect(within(playerOne).getByText('0/72')).toBeInTheDocument();

    fireEvent.click(within(playerOne).getByRole('button', { name: /hint/i }));

    const hintedTiles = [
      ...playerOne.querySelectorAll<HTMLButtonElement>('.tile[data-hint="true"]'),
    ];
    expect(hintedTiles).toHaveLength(2);
    expect(playerOne.querySelector('[data-role="hints"]')).toHaveTextContent('1');

    fireEvent.click(hintedTiles[0]);
    expect(hintedTiles[0]).toHaveAttribute('data-selected', 'true');

    fireEvent.click(hintedTiles[1]);

    expect(playerOne.querySelector('[data-role="score"]')).toHaveTextContent('100');
    expect(playerOne.querySelector('[data-role="pairs"]')).toHaveTextContent('1/72');
    expect(playerOne.querySelectorAll('.tile[data-selected="true"]')).toHaveLength(0);
    expect(playerTwo.querySelector('[data-role="score"]')).toHaveTextContent('0');
    expect(playerTwo.querySelector('[data-role="pairs"]')).toHaveTextContent('0/72');

    await waitFor(() => {
      expect(hintedTiles[0]).toHaveAttribute('data-empty', 'true');
      expect(hintedTiles[1]).toHaveAttribute('data-empty', 'true');
    });
  });

  it('deselects a tile when the same tile is clicked twice', () => {
    const { playerOne } = startDuel();
    const tile = tiles(playerOne)[0];

    fireEvent.click(tile);
    expect(tile).toHaveAttribute('data-selected', 'true');

    fireEvent.click(tile);
    expect(tile).not.toHaveAttribute('data-selected');
    expect(playerOne.querySelectorAll('.tile[data-selected="true"]')).toHaveLength(0);
    expect(playerOne.querySelector('[data-role="score"]')).toHaveTextContent('0');
  });

  it('rejects a mismatched pair without changing the score or clearing tiles', () => {
    const { playerOne } = startDuel();
    const availableTiles = tiles(playerOne);
    const first = availableTiles[0];
    const firstPokemon = first.getAttribute('aria-label')?.split(', row ')[0];
    const second = availableTiles.find(
      (tile) => tile.getAttribute('aria-label')?.split(', row ')[0] !== firstPokemon,
    );

    expect(second).toBeDefined();

    fireEvent.click(first);
    fireEvent.click(second!);

    expect(first).not.toHaveAttribute('data-empty');
    expect(second).not.toHaveAttribute('data-empty');
    expect(playerOne.querySelector('[data-role="score"]')).toHaveTextContent('0');
    expect(playerOne.querySelector('[data-role="pairs"]')).toHaveTextContent('0/72');
  });

  it('shuffles only the selected player board and consumes one shuffle', () => {
    const { playerOne, playerTwo } = startDuel();
    const playerOneBefore = tiles(playerOne).map((tile) => tile.getAttribute('aria-label'));
    const playerTwoBefore = tiles(playerTwo).map((tile) => tile.getAttribute('aria-label'));

    fireEvent.click(within(playerOne).getByRole('button', { name: /shuffle/i }));

    expect(playerOne.querySelector('[data-role="shuffles"]')).toHaveTextContent('1');
    expect(tiles(playerOne).map((tile) => tile.getAttribute('aria-label'))).not.toEqual(playerOneBefore);
    expect(tiles(playerTwo).map((tile) => tile.getAttribute('aria-label'))).toEqual(playerTwoBefore);
    expect(playerTwo.querySelector('[data-role="shuffles"]')).toHaveTextContent('2');
  });

  it('routes keyboard hint controls to the correct player', () => {
    const { playerOne, playerTwo } = startDuel();

    fireEvent.keyDown(window, { code: 'KeyQ' });
    expect(playerOne.querySelector('[data-role="hints"]')).toHaveTextContent('1');
    expect(playerTwo.querySelector('[data-role="hints"]')).toHaveTextContent('2');

    fireEvent.keyDown(window, { code: 'Comma' });
    expect(playerOne.querySelector('[data-role="hints"]')).toHaveTextContent('1');
    expect(playerTwo.querySelector('[data-role="hints"]')).toHaveTextContent('1');
  });

  it('returns to setup when New duel is clicked', () => {
    startDuel();

    fireEvent.click(screen.getByRole('button', { name: /new duel/i }));

    expect(screen.getByRole('button', { name: /start duel/i })).toBeVisible();
    expect(screen.getAllByText(/classic.*9.*16.*24 pokémon/i)).toHaveLength(2);
  });

  it('displays Level 1 · Medium by default and allows starting on Easy difficulty', () => {
    const { container } = render(<App />);

    // Change difficulty to Easy on the start form
    const boardSelect = screen.getByRole('combobox', { name: /board/i });
    fireEvent.change(boardSelect, { target: { value: 'easy' } });

    fireEvent.click(screen.getByRole('button', { name: /start duel/i }));

    expect(container.querySelector('[data-level]')).toHaveTextContent('Level 1 · Easy');

    const playerOne = container.querySelector<HTMLElement>('[data-player="1"]');
    expect(tiles(playerOne!)).toHaveLength(80); // 8 x 10 = 80 tiles
    expect(within(playerOne!).getByText('0/40')).toBeInTheDocument();
  });

  it('escalates difficulty and updates level when Next level is clicked', () => {
    const { playerOne, container } = startDuel();

    expect(container.querySelector('[data-level]')).toHaveTextContent('Level 1 · Medium');
    expect(tiles(playerOne)).toHaveLength(144); // 9 x 16 = 144 tiles

    // Click Next level (inside result overlay)
    const nextLevelBtn = container.querySelector<HTMLButtonElement>('[data-action="next-level"]');
    expect(nextLevelBtn).not.toBeNull();
    fireEvent.click(nextLevelBtn!);

    // Escalated to Level 2 · Hard (12 x 16 = 192 tiles)
    expect(container.querySelector('[data-level]')).toHaveTextContent('Level 2 · Hard');
    expect(tiles(playerOne)).toHaveLength(192);
    expect(within(playerOne).getByText('0/96')).toBeInTheDocument();
  });

  it('switches to solo mode, hides player 2 cabinet, and adapts badges and controls', async () => {
    const { container } = render(<App />);

    const soloTab = screen.getByRole('tab', { name: /solo/i });
    fireEvent.click(soloTab);

    expect(soloTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /same computer/i })).toHaveAttribute('aria-selected', 'false');

    const p2Field = container.querySelector('[data-field-p2]');
    expect(p2Field).toHaveAttribute('hidden');
    expect(container.querySelector('[data-p1-label]')).toHaveTextContent('Your name');
    expect(screen.getByRole('button', { name: /start solo game/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start solo game/i }));

    const arena = container.querySelector('[data-arena]');
    expect(arena).toHaveAttribute('data-mode', 'solo');

    const p1Cabinet = container.querySelector<HTMLElement>('[data-player="1"]');
    const p2Cabinet = container.querySelector<HTMLElement>('[data-player="2"]');
    expect(p1Cabinet).not.toBeNull();
    expect(p2Cabinet).not.toBeNull();
    expect(p2Cabinet).toHaveAttribute('hidden');

    expect(p1Cabinet!.querySelector('.badge')).toHaveTextContent('SOLO');
    expect(p1Cabinet!.querySelector('.tools__keys')).toHaveTextContent(
      'WASD or Arrows move · Space or Enter pick',
    );

    // Both WASD/Q and Arrow/Comma keyboard shortcuts work for Player 1
    fireEvent.keyDown(window, { code: 'KeyQ' });
    expect(p1Cabinet!.querySelector('[data-role="hints"]')).toHaveTextContent('1');

    fireEvent.keyDown(window, { code: 'Comma' });
    expect(p1Cabinet!.querySelector('[data-role="hints"]')).toHaveTextContent('0');

    // Matching tiles works as expected
    const hintedTiles = [
      ...p1Cabinet!.querySelectorAll<HTMLButtonElement>('.tile[data-hint="true"]'),
    ];
    expect(hintedTiles).toHaveLength(2);
    fireEvent.click(hintedTiles[0]);
    fireEvent.click(hintedTiles[1]);

    expect(p1Cabinet!.querySelector('[data-role="score"]')).toHaveTextContent('100');
    expect(p1Cabinet!.querySelector('[data-role="pairs"]')).toHaveTextContent('1/72');

    await waitFor(() => {
      expect(hintedTiles[0]).toHaveAttribute('data-empty', 'true');
      expect(hintedTiles[1]).toHaveAttribute('data-empty', 'true');
    });

    // Next level retains solo mode
    const nextLevelBtn = container.querySelector<HTMLButtonElement>('[data-action="next-level"]');
    expect(nextLevelBtn).not.toBeNull();
    fireEvent.click(nextLevelBtn!);

    expect(container.querySelector('[data-level]')).toHaveTextContent('Level 2 · Hard');
    expect(p2Cabinet).toHaveAttribute('hidden');
    expect(arena).toHaveAttribute('data-mode', 'solo');
  });

  it('supports launching solo mode via query parameters', () => {
    window.history.replaceState({}, '', '/?mode=solo&difficulty=easy&auto=1');
    const { container } = render(<App />);

    const arena = container.querySelector('[data-arena]');
    expect(arena).toHaveAttribute('data-mode', 'solo');

    const p2Cabinet = container.querySelector<HTMLElement>('[data-player="2"]');
    expect(p2Cabinet).toHaveAttribute('hidden');
    expect(container.querySelector('[data-level]')).toHaveTextContent('Level 1 · Easy');
  });
});
