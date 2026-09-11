import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SoloGame } from './index';
import { STORAGE_KEY } from '../../shared/game/profile';

function openSolo() {
  return render(<SoloGame onOpenDuel={() => {}} />);
}

/** Pick a mode, start the run, and step past the Adventure briefing. */
function startRun(container: HTMLElement, mode: RegExp) {
  fireEvent.click(screen.getByRole('radio', { name: mode }));
  fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="start"]')!);

  const go = container.querySelector<HTMLButtonElement>('[data-action="stage-go"]');
  const intro = container.querySelector<HTMLElement>('[data-overlay="stage-intro"]');
  if (go && intro && !intro.hidden) fireEvent.click(go);
}

function liveTiles(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLButtonElement>('.tile:not([data-empty="true"])')];
}

describe('the solo run', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('opens on the mode menu with every mode offered and no board dealt', () => {
    const { container } = openSolo();

    const picker = container.querySelector<HTMLElement>('[data-overlay="mode-picker"]');
    expect(picker).not.toBeNull();
    expect(picker!.hidden).toBe(false);

    for (const mode of [/classic/i, /adventure/i, /time attack/i, /daily/i, /zen/i]) {
      expect(screen.getByRole('radio', { name: mode })).toBeInTheDocument();
    }
    expect(liveTiles(container)).toHaveLength(0);
  });

  it('explains the special tiles before the player ever meets one', () => {
    const { container } = openSolo();
    const guide = container.querySelector('.mark-guide');
    expect(guide).not.toBeNull();
    for (const mark of ['gold', 'ice', 'bomb']) {
      expect(guide!.querySelector(`[data-mark="${mark}"]`)).not.toBeNull();
    }
  });

  it('briefs the player on stage one before dealing the board', () => {
    const { container } = openSolo();
    fireEvent.click(screen.getByRole('radio', { name: /adventure/i }));
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="start"]')!);

    const intro = container.querySelector<HTMLElement>('[data-overlay="stage-intro"]');
    expect(intro).not.toBeNull();
    expect(intro!.hidden).toBe(false);
    expect(intro!.querySelector('[data-stage]')).toHaveTextContent('1');
  });

  it('deals the stage-one board and shows three lives once the briefing is dismissed', () => {
    const { container } = openSolo();
    startRun(container, /adventure/i);

    // Stage one is 6x8, so 48 tiles and 24 pairs.
    expect(liveTiles(container)).toHaveLength(48);

    const hearts = container.querySelectorAll('.heart');
    expect(hearts).toHaveLength(3);
    expect([...hearts].filter((h) => h.getAttribute('data-spent') === 'true')).toHaveLength(0);
  });

  it('scores a hinted pair through real clicks and clears it from the board', async () => {
    const { container } = openSolo();
    startRun(container, /adventure/i);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="hint"]')!);
    const hinted = [...container.querySelectorAll<HTMLButtonElement>('.tile[data-hint="true"]')];
    expect(hinted).toHaveLength(2);

    fireEvent.click(hinted[0]);
    expect(hinted[0]).toHaveAttribute('data-selected', 'true');

    fireEvent.click(hinted[1]);

    await waitFor(() => expect(hinted[0]).toHaveAttribute('data-empty', 'true'));
    expect(hinted[1]).toHaveAttribute('data-empty', 'true');
    expect(liveTiles(container)).toHaveLength(46);
  });

  it('shows the combo readout climbing as matches chain together', () => {
    const { container } = openSolo();
    startRun(container, /adventure/i);

    const combo = container.querySelector<HTMLElement>('.combo');
    expect(combo).not.toBeNull();
    expect(combo!.getAttribute('data-tier')).toBe('0');

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="hint"]')!);
    const hinted = [...container.querySelectorAll<HTMLButtonElement>('.tile[data-hint="true"]')];
    fireEvent.click(hinted[0]);
    fireEvent.click(hinted[1]);

    expect(container.querySelector('.combo__count')).toHaveTextContent('1');
  });

  it('spends a hint and disables the button once none are left', () => {
    const { container } = openSolo();
    startRun(container, /adventure/i);

    const hintButton = container.querySelector<HTMLButtonElement>('[data-action="hint"]')!;
    // Stage one hands out three hints.
    for (let i = 0; i < 3; i += 1) fireEvent.click(hintButton);

    expect(container.querySelector<HTMLButtonElement>('[data-action="hint"]')!.disabled).toBe(true);
  });

  it('hides the clock entirely in Zen rather than showing a frozen one', () => {
    const { container } = openSolo();
    startRun(container, /zen/i);

    expect(liveTiles(container).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-clock]')).toBeNull();
    expect(container.querySelectorAll('.heart')).toHaveLength(0);
  });

  it('starts Time Attack on a short clock instead of the stage clock', () => {
    const { container } = openSolo();
    startRun(container, /time attack/i);

    expect(container.querySelector('[data-clock]')).toHaveTextContent('1:00');
  });

  it('quitting a run returns to the menu and clears the board', () => {
    const { container } = openSolo();
    startRun(container, /adventure/i);
    expect(liveTiles(container).length).toBeGreaterThan(0);

    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="quit"]')!);

    expect(container.querySelector<HTMLElement>('[data-overlay="mode-picker"]')!.hidden).toBe(false);
    expect(liveTiles(container)).toHaveLength(0);
  });

  it('surfaces a stored personal best on the mode card', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        modes: { adventure: { bestScore: 4200, bestStage: 12, bestStreak: 9, plays: 3 } },
        totalPairs: 310,
        totalPlays: 3,
        dayStreak: 2,
        lastPlayedDay: null,
        daily: null,
        unlocks: ['first-clear'],
        stageStars: {},
      }),
    );

    const { container } = openSolo();
    const card = container.querySelector<HTMLElement>('.mode-card[data-mode="adventure"]')!;
    expect(within(card).getByText('12')).toBeInTheDocument();
  });

  it('offers the two-player duel as a way out of the solo menu', () => {
    const calls: number[] = [];
    const { container } = render(<SoloGame onOpenDuel={() => calls.push(1)} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>('[data-action="open-duel"]')!);
    expect(calls).toHaveLength(1);
  });
});
