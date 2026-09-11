import type { DuelMode, PlayerState } from '../../types/duel.types';
import { clockText } from '../../../../shared/utils/format';

interface ResultOverlayProps {
  isOpen: boolean;
  mode: DuelMode;
  winner: number;
  reason: 'cleared' | 'time' | 'disconnect' | null;
  players: PlayerState[];
  nextLevelText: string;
  canAdvanceLevel: boolean;
  onNextLevel: () => void;
  onPlayAgain: () => void;
  onFreshBoard: () => void;
  onChangeSettings: () => void;
}

export function ResultOverlay({
  isOpen,
  mode,
  winner,
  reason,
  players,
  nextLevelText,
  canAdvanceLevel,
  onNextLevel,
  onPlayAgain,
  onFreshBoard,
  onChangeSettings,
}: ResultOverlayProps) {
  const isSolo = mode === 'solo';
  const wonSolo = isSolo && reason === 'cleared';

  return (
    <div className="overlay" data-overlay="result" hidden={!isOpen}>
      <div className="panel panel--result">
        <p className="result__banner" data-result-banner>
          {isSolo ? (
            wonSolo ? (
              <>
                Stage Cleared! Great job, <span>{players[0]?.session.label}</span>
              </>
            ) : (
              "Time's up! Try again."
            )
          ) : winner === -1 ? (
            'Dead heat'
          ) : (
            <>
              Winner <span>{players[winner]?.session.label}</span>
            </>
          )}
        </p>

        <div className="scoreboard" data-scoreboard>
          {players.map((player) => {
            const isWinner = isSolo ? wonSolo : player.index === winner;
            return (
              <article
                key={player.index}
                className="score-card"
                data-player={String(player.index + 1)}
                data-winner={String(isWinner)}
              >
                <h3>{player.session.label}</h3>
                <dl>
                  <dt>Score</dt>
                  <dd>{player.session.score}</dd>
                  <dt>Pairs</dt>
                  <dd>
                    {player.session.matchedPairs}/{player.totalPairs}
                  </dd>
                  <dt>Best streak</dt>
                  <dd>×{player.session.bestStreak}</dd>
                  <dt>Misses</dt>
                  <dd>{player.session.mistakes}</dd>
                  <dt>Tiles left</dt>
                  <dd>{player.session.board.remaining}</dd>
                  <dt>Finished</dt>
                  <dd>{player.finishedAt ? clockText(player.finishedAt) : '—'}</dd>
                </dl>
              </article>
            );
          })}
        </div>

        <div className="panel__actions">
          <button
            className="btn btn--primary"
            type="button"
            data-action="next-level"
            disabled={!canAdvanceLevel}
            onClick={onNextLevel}
          >
            {nextLevelText}
          </button>
          <button className="btn" type="button" data-action="play-again" onClick={onPlayAgain}>
            Same board again
          </button>
          <button className="btn" type="button" data-action="fresh-board" onClick={onFreshBoard}>
            Fresh board
          </button>
          <button className="btn" type="button" data-action="new" onClick={onChangeSettings}>
            Change settings
          </button>
        </div>
      </div>
    </div>
  );
}
