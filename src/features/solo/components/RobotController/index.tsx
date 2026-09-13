/**
 * Robot Solver UI Controller.
 *
 * Provides a floating overlay control dashboard allowing users to:
 * - Trigger instantaneous or smooth auto-solving of the current round.
 * - Toggle continuous auto-play across stages.
 * - Step through moves one-by-one to inspect solver logic.
 * - Adjust solving speed (Smooth, Fast, Turbo, Instant).
 */

import type { RobotSolverState, RobotSpeed } from '../../hooks/useRobotSolver.ts';
import styles from './RobotController.module.scss';

export interface RobotControllerProps {
  solver: RobotSolverState;
  isOpen: boolean;
  onClose: () => void;
  canAct: boolean;
  stage?: number;
}

const SPEED_OPTIONS: { id: RobotSpeed; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
];

export function RobotController({
  solver,
  isOpen,
  onClose,
  canAct,
  stage,
}: RobotControllerProps) {
  if (!isOpen) return null;

  const {
    isRunning,
    isSolvingRound,
    speed,
    autoAdvance,
    lastActionReason,
    setSpeed,
    setAutoAdvance,
    toggleRobot,
    solveRound,
    stepOnce,
  } = solver;

  const active = isRunning || isSolvingRound;

  return (
    <div
      className={styles.robotPanel}
      data-running={active ? 'true' : 'false'}
      role="region"
      aria-label="Robot Solver Controller"
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.pulsingDot} data-active={active ? 'true' : 'false'} />
          <span>🤖 Robot Solver {stage ? `(S${stage})` : ''}</span>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close Robot Controller"
        >
          ✕
        </button>
      </div>

      <div className={styles.actionRow}>
        <button
          type="button"
          className={styles.solveBtn}
          onClick={solveRound}
          disabled={!canAct || isSolvingRound}
          title="Auto-solve the entire round"
        >
          ⚡ {isSolvingRound ? 'Solving...' : 'Solve Round'}
        </button>

        <button
          type="button"
          className={styles.toggleBtn}
          data-active={isRunning ? 'true' : 'false'}
          onClick={toggleRobot}
        >
          {isRunning ? '⏸ Pause' : '▶ Auto Play'}
        </button>

        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => stepOnce()}
          disabled={!canAct || active}
        >
          ⏭ Step 1 Move
        </button>
      </div>

      <span className={styles.sectionLabel}>Solving Speed</span>
      <div className={styles.speedSelector} role="radiogroup" aria-label="Robot Speed">
        {SPEED_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={styles.speedPill}
            data-selected={speed === opt.id ? 'true' : 'false'}
            onClick={() => setSpeed(opt.id)}
            role="radio"
            aria-checked={speed === opt.id}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className={styles.autoAdvanceLabel}>
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => setAutoAdvance(e.target.checked)}
        />
        <span>Auto next stage on clear</span>
      </label>

      {lastActionReason && (
        <div className={styles.statusNote}>
          Priority: {lastActionReason === 'bomb' ? '💣 Defusing ticking bomb' :
                     lastActionReason === 'chrono' ? '⏱ Harvesting chrono freeze' :
                     lastActionReason === 'gold' ? '⭐ Collecting gold bonus' :
                     lastActionReason === 'shuffling' ? '🔄 Reshuffling board' :
                     '🔗 Orthogonal connection'}
        </div>
      )}
    </div>
  );
}
