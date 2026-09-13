import type { Difficulty, OnlinePeer, DuelRules } from '../../types/duel.types';

interface LobbyOverlayProps {
  isOpen: boolean;
  roomCode: string;
  statusText: string;
  inviteLink: string;
  peers: OnlinePeer[];
  isHost: boolean;
  settings: { difficulty: Difficulty; clock: number; rules?: DuelRules };
  onCopyInvite: () => void;
  onChangeDifficulty: (difficulty: Difficulty) => void;
  onChangeClock: (clock: number) => void;
  onChangeRules: (rules: DuelRules) => void;
  onStartDuel: () => void;
  onLeaveRoom: () => void;
}

export function LobbyOverlay({
  isOpen,
  roomCode,
  statusText,
  inviteLink,
  peers,
  isHost,
  settings,
  onCopyInvite,
  onChangeDifficulty,
  onChangeClock,
  onChangeRules,
  onStartDuel,
  onLeaveRoom,
}: LobbyOverlayProps) {
  return (
    <div className="overlay" data-overlay="lobby" hidden={!isOpen}>
      <div className="panel">
        <div className="panel__eyebrow">Online room</div>
        <h1>
          Room <em data-lobby-code>{roomCode || '······'}</em>
        </h1>
        <p className="panel__lede" data-lobby-status>
          {statusText}
        </p>

        <div className="invite">
          <input
            type="text"
            readOnly
            value={inviteLink}
            data-invite-link
            aria-label="Invite link to share"
          />
          <button className="btn" type="button" data-action="copy-invite" onClick={onCopyInvite}>
            Copy link
          </button>
        </div>

        <ol className="seats" data-lobby-seats>
          {peers.map((p, idx) => (
            <li key={p.id} className="seat seat--taken">
              <span className="badge">P{idx + 1}</span>
              <strong>{p.name}</strong>
              {idx === 0 && <span className="seat__tag">Host</span>}
            </li>
          ))}
          {peers.length < 2 && (
            <li className="seat seat--empty">
              <span className="badge">P2</span>
              <span>Waiting for a challenger…</span>
            </li>
          )}
        </ol>

        <div className="setup" data-lobby-settings hidden={!isHost}>
          <label className="field" htmlFor="lobby-difficulty">
            Board / Difficulty
            <select
              id="lobby-difficulty"
              data-lobby-difficulty
              value={settings.difficulty}
              onChange={(e) => onChangeDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Easy — Quick · 8 × 10 · 16 Pokémon</option>
              <option value="normal">Medium — Classic · 9 × 16 · 24 Pokémon</option>
              <option value="hard">Hard — Grand · 12 × 16 · 48 Pokémon</option>
            </select>
          </label>
          <label className="field" htmlFor="lobby-clock">
            Clock
            <select
              id="lobby-clock"
              data-lobby-clock
              value={String(settings.clock)}
              onChange={(e) => onChangeClock(Number(e.target.value))}
            >
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
              <option value="480">8 minutes</option>
              <option value="0">No clock</option>
            </select>
          </label>
        </div>

        <label className="field rules-choice">
          Rules
          <select disabled={!isHost} value={settings.rules ?? 'classic'} onChange={(e) => onChangeRules(e.target.value as DuelRules)}>
            <option value="classic">Classic</option>
            <option value="rush">Duel Rush — 5s combos, Fever at 5</option>
          </select>
        </label>

        <div className="panel__actions">
          <button
            className="btn btn--primary"
            type="button"
            data-action="host-start"
            disabled={!isHost || peers.length < 2}
            onClick={onStartDuel}
          >
            Start duel
          </button>
          <button className="btn" type="button" data-action="leave-room" onClick={onLeaveRoom}>
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
