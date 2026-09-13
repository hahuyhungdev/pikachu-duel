import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RobotController } from './components/RobotController';
import type { RobotSolverState } from './hooks/useRobotSolver';
import { createSession, select } from '../../game/session';
import { findSmartRobotMove } from '../../game/bot';
import { AdminStageBar } from '../admin';
import { RunHud } from './components/RunHud';

function mockSolverState(overrides: Partial<RobotSolverState> = {}): RobotSolverState {
  return {
    isRunning: false,
    isSolvingRound: false,
    speed: 'fast',
    autoAdvance: false,
    lastActionReason: null,
    setSpeed: vi.fn(),
    setAutoAdvance: vi.fn(),
    startRobot: vi.fn(),
    stopRobot: vi.fn(),
    toggleRobot: vi.fn(),
    solveRound: vi.fn(),
    stepOnce: vi.fn(() => true),
    ...overrides,
  };
}

describe('RobotController UI', () => {
  it('renders robot controller when open and triggers solveRound when Solve Round button is clicked', () => {
    const solver = mockSolverState();
    const onClose = vi.fn();

    render(
      <RobotController
        solver={solver}
        isOpen={true}
        onClose={onClose}
        canAct={true}
        stage={16}
      />,
    );

    expect(screen.getByText(/Robot Solver \(S16\)/i)).toBeInTheDocument();
    const solveBtn = screen.getByRole('button', { name: /Solve Round/i });
    expect(solveBtn).toBeEnabled();

    fireEvent.click(solveBtn);
    expect(solver.solveRound).toHaveBeenCalledTimes(1);

    const autoPlayBtn = screen.getByRole('button', { name: /Auto Play/i });
    fireEvent.click(autoPlayBtn);
    expect(solver.toggleRobot).toHaveBeenCalledTimes(1);

    const stepBtn = screen.getByRole('button', { name: /Step 1 Move/i });
    fireEvent.click(stepBtn);
    expect(solver.stepOnce).toHaveBeenCalledTimes(1);

    const turboPill = screen.getByRole('radio', { name: 'Turbo' });
    fireEvent.click(turboPill);
    expect(solver.setSpeed).toHaveBeenCalledWith('turbo');
  });

  it('does not render when isOpen is false', () => {
    const solver = mockSolverState();
    const { container } = render(
      <RobotController
        solver={solver}
        isOpen={false}
        onClose={vi.fn()}
        canAct={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('Robot move execution on real game session', () => {
  it('finds and clears pairs iteratively until the board is empty', () => {
    // 2x2 board with 2 matching pairs
    const session = createSession({
      rows: 2,
      cols: 2,
      seed: 42,
    });

    expect(session.board.remaining).toBe(4);

    let steps = 0;
    while (session.board.remaining > 0 && steps < 10) {
      const decision = findSmartRobotMove(session.board);
      expect(decision).not.toBeNull();
      const { a, b } = decision!.move;

      select(session, a.r, a.c);
      select(session, b.r, b.c);
      steps += 1;
    }

    expect(session.board.remaining).toBe(0);
    expect(session.status).toBe('won');
  });
});

describe('Robot integration with AdminStageBar and RunHud', () => {
  it('renders Robot button in RunHud and fires onToggleRobot', () => {
    const onToggleRobot = vi.fn();
    render(
      <RunHud
        hud={{
          mode: 'adventure',
          modeLabel: 'Adventure',
          stage: 16,
          stageNote: 'Bombs & Ice',
          hearts: 3,
          heartsLeft: 3,
          timed: true,
          timeLeft: 60,
          freezeLeft: 0,
          overtimeLeft: 0,
          streak: 0,
          tier: 0,
          fever: false,
          pairsLeft: 10,
          totalPairs: 10,
          score: 1000,
          runScore: 1000,
          bestScore: 2000,
          objective: 'Clear stage 16',
          hintsLeft: 3,
          shufflesLeft: 3,
          isUrgent: false,
          isCritical: false,
          isFrozen: false,
          isOvertime: false,
          comboProgress: 0,
        }}
        isMuted={false}
        canHint={true}
        canShuffle={true}
        isRobotRunning={false}
        onHint={vi.fn()}
        onShuffle={vi.fn()}
        onToggleSound={vi.fn()}
        onQuit={vi.fn()}
        onToggleRobot={onToggleRobot}
      />,
    );

    const robotBtn = screen.getByRole('button', { name: /Robot/i });
    expect(robotBtn).toBeInTheDocument();
    fireEvent.click(robotBtn);
    expect(onToggleRobot).toHaveBeenCalledTimes(1);
  });

  it('renders Solve Round button in AdminStageBar and fires onSolveRound', () => {
    const onSolveRound = vi.fn();
    render(
      <AdminStageBar
        currentStage={16}
        onJumpStage={vi.fn()}
        onSolveRound={onSolveRound}
      />,
    );

    const solveBtn = screen.getByRole('button', { name: /Solve Round/i });
    expect(solveBtn).toBeInTheDocument();
    fireEvent.click(solveBtn);
    expect(onSolveRound).toHaveBeenCalledTimes(1);
  });
});
