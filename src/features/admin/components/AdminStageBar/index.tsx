import { useState } from 'react';
import styles from './AdminStageBar.module.scss';

export interface AdminStageBarProps {
  currentStage?: number;
  onJumpStage: (targetStage: number) => void;
  onOpenAdminPanel?: () => void;
}

const QUICK_STAGES = [1, 4, 8, 16, 24, 32];

export function AdminStageBar({ currentStage = 1, onJumpStage, onOpenAdminPanel }: AdminStageBarProps) {
  const [targetStage, setTargetStage] = useState<number>(currentStage);
  const [minimized, setMinimized] = useState(false);

  const handleJump = (stageToJump: number) => {
    const clamped = Math.max(1, Math.floor(stageToJump));
    setTargetStage(clamped);
    onJumpStage(clamped);
  };

  if (minimized) {
    return (
      <button
        type="button"
        className={styles.minimizedBadge}
        onClick={() => setMinimized(false)}
        aria-label="Open Admin Stage Controller"
      >
        🛠️ Stage: {currentStage}
      </button>
    );
  }

  return (
    <div className={styles.stageBar} role="region" aria-label="Admin Stage Controller">
      <div className={styles.titleGroup}>
        <span>🛠️ Admin</span>
      </div>

      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => setTargetStage((prev) => Math.max(1, prev - 1))}
          aria-label="Decrease Stage"
        >
          -
        </button>
        <input
          type="number"
          min={1}
          max={999}
          className={styles.stageInput}
          value={targetStage}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!Number.isNaN(val)) setTargetStage(Math.max(1, val));
          }}
          aria-label="Target Stage Number"
        />
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => setTargetStage((prev) => prev + 1)}
          aria-label="Increase Stage"
        >
          +
        </button>
      </div>

      <button
        type="button"
        className={styles.jumpBtn}
        onClick={() => handleJump(targetStage)}
      >
        ⚡ Jump to {targetStage}
      </button>

      <div className={styles.quickPills}>
        {QUICK_STAGES.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.pillBtn}
            onClick={() => handleJump(s)}
          >
            S{s}
          </button>
        ))}
      </div>

      {onOpenAdminPanel ? (
        <button
          type="button"
          className={styles.adminLink}
          onClick={onOpenAdminPanel}
        >
          Panel ⚙️
        </button>
      ) : (
        <a href="/admin" className={styles.adminLink}>
          Panel ⚙️
        </a>
      )}

      <button
        type="button"
        className={styles.closeBtn}
        onClick={() => setMinimized(true)}
        aria-label="Minimize Admin Bar"
      >
        ✕
      </button>
    </div>
  );
}
