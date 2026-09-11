import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SoloGame } from './index';
import { RunResult } from './components/RunResult';
import { RunHud } from './components/RunHud';
import type { RunSummary, SoloHud } from './types/solo.types';
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
    for (const mark of ['gold', 'chrono', 'ice', 'bomb']) {
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

  it('renders time reward strip with speed bonus and recovered heart/aids on clear', () => {
    const summary: RunSummary = {
      mode: 'adventure',
      modeLabel: 'Adventure',
      stage: 5,
      stars: 3,
      runScore: 12500,
      stageScore: 8000,
      timeBonus: 2250,
      timeLeft: 45,
      recoveredHeart: true,
      recoveredAids: true,
      pairs: 48,
      bestStreak: 12,
      heartsLeft: 3,
      records: { score: true, stage: false, streak: false },
      previousBest: { score: 10000, stage: 5, streak: 10 },
      newUnlocks: [],
    };
    render(
      <RunResult
        isOpen={true}
        phase="cleared"
        summary={summary}
        canContinue={true}
        continueLabel="Next stage 6 →"
        onContinue={() => {}}
        onRetryRun={() => {}}
        onChangeMode={() => {}}
      />,
    );
    expect(screen.getByText(/Speed Bonus/)).toBeInTheDocument();
    expect(screen.getByText(/\+2,250 pts/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 Life Restored!/)).toBeInTheDocument();
    expect(screen.getByText(/\+1 Hint & Shuffle Bonus!/)).toBeInTheDocument();
  });

  it('renders clock in frozen and overtime states', () => {
    const baseHud: SoloHud = {
      mode: 'adventure',
      modeLabel: 'Adventure',
      stage: 5,
      stageNote: '5 chrono',
      objective: 'Clear the board',
      timed: true,
      timeLeft: 120,
      isUrgent: false,
      isCritical: false,
      isFrozen: true,
      freezeLeft: 5,
      hearts: 3,
      heartsLeft: 3,
      score: 1000,
      runScore: 1000,
      streak: 2,
      tier: 1,
      fever: false,
      comboProgress: 0.5,
      hintsLeft: 3,
      shufflesLeft: 3,
      pairsLeft: 20,
      totalPairs: 24,
      bestScore: 5000,
    };
    const { container, rerender } = render(
      <RunHud
        hud={baseHud}
        isMuted={false}
        canHint={true}
        canShuffle={true}
        onHint={() => {}}
        onShuffle={() => {}}
        onToggleSound={() => {}}
        onQuit={() => {}}
      />,
    );
    const clock = container.querySelector('[data-clock]')!;
    expect(clock).toHaveAttribute('data-frozen', 'true');
    expect(clock).toHaveTextContent(/❄ 02:00/);

    rerender(
      <RunHud
        hud={{
          ...baseHud,
          timeLeft: 0,
          isFrozen: false,
          freezeLeft: 0,
          isOvertime: true,
          overtimeLeft: 3,
          isCritical: true,
        }}
        isMuted={false}
        canHint={true}
        canShuffle={true}
        onHint={() => {}}
        onShuffle={() => {}}
        onToggleSound={() => {}}
        onQuit={() => {}}
      />,
    );
    expect(clock).toHaveAttribute('data-overtime', 'true');
    expect(clock).toHaveTextContent(/⚡ 00:03/);
  });

  it('opens and closes the AuthModal from the mode menu user button', () => {
    const { container } = openSolo();
    const userBtn = container.querySelector<HTMLButtonElement>('[data-action="open-auth"]');
    expect(userBtn).not.toBeNull();

    expect(container.querySelector('[data-overlay="auth-modal"]')).toBeNull();

    fireEvent.click(userBtn!);
    const authModal = container.querySelector('[data-overlay="auth-modal"]');
    expect(authModal).not.toBeNull();

    const closeBtn = within(authModal as HTMLElement).getByRole('button', { name: /đóng/i });
    fireEvent.click(closeBtn);
    expect(container.querySelector('[data-overlay="auth-modal"]')).toBeNull();
  });

  it('opens and closes the LeaderboardModal from the mode menu leaderboard button', () => {
    const { container } = openSolo();
    const lbBtn = container.querySelector<HTMLButtonElement>('[data-action="open-leaderboard"]');
    expect(lbBtn).not.toBeNull();

    expect(container.querySelector('[data-overlay="leaderboard-modal"]')).toBeNull();

    fireEvent.click(lbBtn!);
    const lbModal = container.querySelector('[data-overlay="leaderboard-modal"]');
    expect(lbModal).not.toBeNull();

    const closeBtn = within(lbModal as HTMLElement).getByRole('button', { name: /^đóng$/i });
    fireEvent.click(closeBtn);
    expect(container.querySelector('[data-overlay="leaderboard-modal"]')).toBeNull();
  });

  it('renders global rank badge and open leaderboard button in RunResult', () => {
    let leaderboardOpened = false;
    const summary: RunSummary = {
      mode: 'adventure',
      modeLabel: 'Adventure',
      stage: 5,
      stars: 3,
      runScore: 12500,
      stageScore: 2500,
      pairs: 24,
      bestStreak: 12,
      heartsLeft: 3,
      records: { score: true, stage: true, streak: true },
      previousBest: { score: 10000, stage: 4, streak: 8 },
      newUnlocks: [],
      globalRank: 4,
    };
    const { container } = render(
      <RunResult
        isOpen={true}
        phase="cleared"
        summary={summary}
        canContinue={true}
        continueLabel="Next stage 6 →"
        onContinue={() => {}}
        onRetryRun={() => {}}
        onChangeMode={() => {}}
        onOpenLeaderboard={() => {
          leaderboardOpened = true;
        }}
      />,
    );

    expect(screen.getByText(/Hạng #4 Toàn Cầu/)).toBeInTheDocument();
    const lbBtn = container.querySelector<HTMLButtonElement>('.panel__actions [data-action="open-leaderboard"]');
    expect(lbBtn).not.toBeNull();
    fireEvent.click(lbBtn!);
    expect(leaderboardOpened).toBe(true);
  });
});
