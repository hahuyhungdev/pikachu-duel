import type { DuelMode, PlayerState } from '../../types/duel.types';
import { Board } from '../Board';

interface CabinetProps {
  player: PlayerState;
  mode: DuelMode;
  opponent?: PlayerState;
  hidden?: boolean;
  onPick: (r: number, c: number) => void;
  onHint: () => void;
  onShuffle: () => void;
}

export function Cabinet({ player, opponent, mode, hidden, onPick, onHint, onShuffle }: CabinetProps) {
  const playerNum = (player.index + 1) as 1 | 2;
  const isFirst = player.index === 0;
  const isSolo = mode === 'solo';

  const badgeText = isSolo ? 'SOLO' : `P${playerNum}`;
  const playerPercent = player.totalPairs > 0
    ? Math.round((player.session.matchedPairs / player.totalPairs) * 100)
    : 0;

  const opponentPercent = opponent && opponent.totalPairs > 0
    ? Math.round((opponent.session.matchedPairs / opponent.totalPairs) * 100)
    : 0;

  const diff = playerPercent - opponentPercent;
  const hasOpponent = !isSolo && Boolean(opponent);
  const isLeading = hasOpponent && diff > 0;
  const isTrailing = hasOpponent && diff < 0;
  const isTied = hasOpponent && diff === 0 && (playerPercent > 0 || opponentPercent > 0);

  const isPlayerCritical = playerPercent >= 80 && playerPercent < 100;
  const isOpponentCritical = opponentPercent >= 80 && opponentPercent < 100;
  const isTension = hasOpponent && (isPlayerCritical || isOpponentCritical);

  const progressClasses = [
    'duel-progress',
    isTension ? 'duel-progress--tension' : '',
    isLeading ? 'duel-progress--lead' : '',
  ].filter(Boolean).join(' ');

  return (
    <section
      className="cabinet"
      data-cabinet
      data-player={playerNum}
      data-state={player.session.status}
      hidden={hidden}
      data-remote={player.remote ? 'true' : undefined}
    >
      <header className="cabinet__head">
        <div className="who">
          <span className="badge">{badgeText}</span>
          <h2 data-role="name">{player.session.label}</h2>
        </div>
        <dl className="stats">
          <div>
            <dt>Score</dt>
            <dd data-role="score">{player.session.score}</dd>
          </div>
          <div>
            <dt>Pairs</dt>
            <dd data-role="pairs">
              {player.session.matchedPairs}/{player.totalPairs}
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd data-role="streak">×{player.session.streak}</dd>
          </div>
        </dl>
      </header>

      <div className={progressClasses} data-role="duel-progress">
        <div className="duel-progress__readout">
          <div className="duel-progress__metric">
            <span className="duel-progress__label">Progress</span>
            <div className="duel-progress__value-wrap">
              <span className="duel-progress__value" data-role="progress-percent">
                {playerPercent}
              </span>
              <span className="duel-progress__symbol">%</span>
            </div>
          </div>

          {hasOpponent && (
            <div className="duel-progress__indicators">
              {isLeading && (
                <span className="duel-badge duel-badge--lead" data-role="lead-indicator">
                  ⚡ +{diff}% LEAD
                </span>
              )}
              {isTrailing && (
                <span className="duel-badge duel-badge--trailing" data-role="lead-indicator">
                  ▼ {diff}%
                </span>
              )}
              {isTied && (
                <span className="duel-badge duel-badge--tied" data-role="lead-indicator">
                  ⚔️ TIED
                </span>
              )}
              {isPlayerCritical && (
                <span className="duel-badge duel-badge--critical">
                  🔥 MATCH POINT
                </span>
              )}
              {!isPlayerCritical && isOpponentCritical && (
                <span className="duel-badge duel-badge--alarm">
                  🚨 OPPONENT AT {opponentPercent}%!
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div data-board-mount>
        {player.remote ? (
          <div className="remote" data-remote-panel>
            <p className="remote__figure">
              <strong data-role="big-pairs">{player.session.matchedPairs}</strong>
              <span data-role="big-total">of {player.totalPairs} pairs cleared</span>
            </p>
            <p className="remote__state" data-role="remote-state">
              {player.remoteState ?? 'Playing…'}
            </p>
          </div>
        ) : (
          <Board
            board={player.session.board}
            label={player.session.label}
            selected={player.session.selected}
            hint={player.session.hint}
            cursor={player.cursor}
            clearingTiles={player.clearingTiles}
            shakingTiles={player.shakingTiles}
            traces={player.traces}
            floaters={player.floaters}
            veil={player.veil}
            onPick={onPick}
          />
        )}
      </div>

      <footer className="tools">
        <div className="hud__actions">
          <button
            className="btn"
            type="button"
            data-action="hint"
            disabled={player.session.hintsLeft <= 0 || player.session.status !== 'playing'}
            onClick={onHint}
          >
            Hint <kbd>{isFirst ? 'Q' : ','}</kbd>
            <span className="count" data-role="hints">
              {player.session.hintsLeft}
            </span>
          </button>
          <button
            className="btn"
            type="button"
            data-action="shuffle"
            disabled={player.session.shufflesLeft <= 0 || player.session.status !== 'playing'}
            onClick={onShuffle}
          >
            Shuffle <kbd>{isFirst ? 'E' : '.'}</kbd>
            <span className="count" data-role="shuffles">
              {player.session.shufflesLeft}
            </span>
          </button>
        </div>
        <p className="tools__keys">
          {isSolo ? (
            'WASD or Arrows move · Space or Enter pick'
          ) : isFirst ? (
            <>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move · <kbd>Space</kbd> pick
            </>
          ) : (
            <>
              <kbd>↑</kbd>
              <kbd>←</kbd>
              <kbd>↓</kbd>
              <kbd>→</kbd> move · <kbd>Enter</kbd> pick
            </>
          )}
        </p>
      </footer>
    </section>
  );
}
