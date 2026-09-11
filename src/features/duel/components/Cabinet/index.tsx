import type { DuelMode, PlayerState } from '../../types/duel.types';
import { Board } from '../Board';

interface CabinetProps {
  player: PlayerState;
  mode: DuelMode;
  hidden?: boolean;
  onPick: (r: number, c: number) => void;
  onHint: () => void;
  onShuffle: () => void;
}

export function Cabinet({ player, mode, hidden, onPick, onHint, onShuffle }: CabinetProps) {
  const playerNum = (player.index + 1) as 1 | 2;
  const isFirst = player.index === 0;
  const isSolo = mode === 'solo';

  const badgeText = isSolo ? 'SOLO' : `P${playerNum}`;
  const meterWidth = player.totalPairs > 0 ? (player.session.matchedPairs / player.totalPairs) * 100 : 0;

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

      <div className="meter">
        <span className="meter__fill" data-role="meter" style={{ width: `${meterWidth}%` }} />
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
