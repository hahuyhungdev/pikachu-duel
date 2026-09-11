import { clockText } from '../../../../shared/utils/format';

interface HudProps {
  level: number;
  difficultyLabel: string;
  seed: number;
  timeLeft: number;
  isUrgent: boolean;
  canRematch: boolean;
  isMuted: boolean;
  linkState?: string;
  onRematch: () => void;
  onNewDuel: () => void;
  onToggleSound: () => void;
}

export function Hud({
  level,
  difficultyLabel,
  seed,
  timeLeft,
  isUrgent,
  canRematch,
  isMuted,
  linkState,
  onRematch,
  onNewDuel,
  onToggleSound,
}: HudProps) {
  const seedHex = seed > 0 ? `#${seed.toString(36).toUpperCase()}` : '#—';

  return (
    <header className="hud">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          P
        </span>
        <span>
          Pikachu <em>Duel</em>
        </span>
        <span className="level-badge" data-level>
          Level {level} · {difficultyLabel}
        </span>
        <span className="seed" data-seed>
          {seedHex}
        </span>
      </div>
      <output
        className="clock"
        data-clock
        data-urgent={isUrgent ? 'true' : 'false'}
        aria-label="Match clock"
      >
        {clockText(timeLeft)}
      </output>
      <div className="hud__actions">
        <button
          className="btn"
          type="button"
          data-action="rematch"
          disabled={!canRematch}
          onClick={onRematch}
        >
          Rematch
        </button>
        <button className="btn" type="button" data-action="new" onClick={onNewDuel}>
          New duel
        </button>
        <button
          className="btn"
          type="button"
          data-action="sound"
          aria-pressed={!isMuted}
          onClick={onToggleSound}
        >
          {isMuted ? 'Sound off' : 'Sound on'}
        </button>
        <span className="link-state" data-link-state hidden={!linkState}>
          {linkState}
        </span>
      </div>
    </header>
  );
}
