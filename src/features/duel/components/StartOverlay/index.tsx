import { useState, type FormEvent } from 'react';
import { isRoomCode } from '../../../../net/config.js';
import type { Difficulty, DuelMode, DuelSetup, DuelRules } from '../../types/duel.types';

interface StartOverlayProps {
  isOpen: boolean;
  activeMode: DuelMode;
  initialP1?: string;
  initialP2?: string;
  initialDifficulty?: Difficulty;
  initialClock?: number;
  onlineNote?: string;
  onChangeMode: (mode: DuelMode) => void;
  onStartGame: (setup: DuelSetup) => void;
  onJoinOnline: (room: string, name: string) => void;
}

export function StartOverlay({
  isOpen,
  activeMode,
  initialP1 = '',
  initialP2 = '',
  initialDifficulty = 'normal',
  initialClock = 300,
  onlineNote = '',
  onChangeMode,
  onStartGame,
  onJoinOnline,
}: StartOverlayProps) {
  const [p1, setP1] = useState(initialP1);
  const [p2, setP2] = useState(initialP2);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [clock, setClock] = useState<number>(initialClock);
  const [rules, setRules] = useState<DuelRules>('rush');
  const [onlineName, setOnlineName] = useState(initialP1 || 'Player');
  const [onlineRoom, setOnlineRoom] = useState(() => {
    if (typeof window !== 'undefined') {
      const roomParam = new URLSearchParams(window.location.search).get('room');
      if (roomParam) return roomParam.toUpperCase();
    }
    return '';
  });
  const [roomError, setRoomError] = useState('');

  const handleStartSubmit = (e: FormEvent) => {
    e.preventDefault();
    const fallbackP1 = activeMode === 'solo' ? 'Player' : 'Player One';
    onStartGame({
      mode: activeMode,
      names: [p1.trim().slice(0, 18) || fallbackP1, p2.trim().slice(0, 18) || 'Player Two'],
      difficulty,
      clock: Number(clock),
      rules,
    });
  };

  const handleOnlineSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanRoom = onlineRoom.trim().toUpperCase();
    if (cleanRoom && !isRoomCode(cleanRoom)) {
      setRoomError('Room code must be 4–12 letters or numbers (e.g. 1234 or K7M2QB), or leave blank to create a room.');
      return;
    }
    setRoomError('');
    onJoinOnline(cleanRoom, onlineName.trim().slice(0, 18) || 'Player');
  };

  return (
    <div className="overlay" data-overlay="start" hidden={!isOpen}>
      <div className="panel">
        <div className="panel__eyebrow">Original link-match challenge</div>
        <h1 aria-label="Pikachu Duel">
          <span>Pikachu</span>
          <em>Duel</em>
        </h1>
        <p className="panel__lede">
          The 2003 Onet / Kawai arcade rules, built for two. Both players face the exact same board.
        </p>

        <div className="modes" role="tablist" aria-label="How you want to play">
          <button
            className="mode"
            type="button"
            role="tab"
            data-mode-btn="solo"
            aria-selected={activeMode === 'solo'}
            onClick={() => onChangeMode('solo')}
          >
            Solo<small>One player against the clock</small>
          </button>
          <button
            className="mode"
            type="button"
            role="tab"
            data-mode-btn="local"
            aria-selected={activeMode === 'local'}
            onClick={() => onChangeMode('local')}
          >
            Same computer<small>Two players, one keyboard</small>
          </button>
          <button
            className="mode"
            type="button"
            role="tab"
            data-mode-btn="online"
            aria-selected={activeMode === 'online'}
            onClick={() => onChangeMode('online')}
          >
            Online<small>Play a friend over the internet</small>
          </button>
        </div>

        <form data-start-form hidden={activeMode === 'online'} onSubmit={handleStartSubmit}>
          <div className="setup">
            <label className="field" data-field-p1>
              <span data-p1-label>{activeMode === 'solo' ? 'Your name' : 'Player 1 name'}</span>
              <input
                name="p1"
                type="text"
                maxLength={18}
                placeholder="Player One"
                autoComplete="off"
                value={p1}
                onChange={(e) => setP1(e.target.value)}
              />
            </label>
            <label className="field" data-field-p2 hidden={activeMode === 'solo'}>
              <span>Player 2 name</span>
              <input
                name="p2"
                type="text"
                maxLength={18}
                placeholder="Player Two"
                autoComplete="off"
                value={p2}
                onChange={(e) => setP2(e.target.value)}
              />
            </label>
            <label className="field">
              Board / Difficulty
              <select
                name="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              >
                <option value="easy">Easy — Quick · 8 × 10 · 16 Pokémon</option>
                <option value="normal">Medium — Classic · 9 × 16 · 24 Pokémon</option>
                <option value="hard">Hard — Grand · 12 × 16 · 48 Pokémon</option>
              </select>
            </label>
            <label className="field">
              Clock
              <select
                name="clock"
                value={String(clock)}
                onChange={(e) => setClock(Number(e.target.value))}
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
            <select value={rules} onChange={(e) => setRules(e.target.value as DuelRules)}>
              <option value="rush">Duel Rush — timed combos</option>
              <option value="classic">Classic — steady matching</option>
            </select>
          </label>
          <p className="note">{rules === 'rush'
            ? 'Match within five seconds to keep your combo. Five in a row: Fever ×2 and one bonus hint per board.'
            : 'Take time to plan. Your combo lasts until a missed match.'}</p>

          <div className="rules-brief">
            <div>
              <span>01</span>
              <p>Match two identical Pokémon.</p>
            </div>
            <div>
              <span>02</span>
              <p>Connect through empty space with ≤ 2 turns.</p>
            </div>
            <div>
              <span>03</span>
              <p data-rules-goal>
                {activeMode === 'solo'
                  ? 'Clear the board before the clock runs out.'
                  : 'Clear the mirrored grid before your rival.'}
              </p>
            </div>
          </div>

          <div className="panel__actions">
            <button className="btn btn--primary" type="submit" data-start-submit>
              {activeMode === 'solo' ? 'Start solo game' : 'Start duel'}
            </button>
            <span className="tools__keys">Default arena: 16 columns × 9 rows.</span>
          </div>
        </form>

        <form data-online-form hidden={activeMode !== 'online'} onSubmit={handleOnlineSubmit}>
          <div className="setup">
            <label className="field">
              Your name
              <input
                name="name"
                type="text"
                maxLength={18}
                placeholder="Ash"
                autoComplete="off"
                value={onlineName}
                onChange={(e) => setOnlineName(e.target.value)}
              />
            </label>
            <label className="field">
              Room code
              <input
                name="room"
                type="text"
                maxLength={12}
                placeholder="Leave blank to create a room"
                autoComplete="off"
                value={onlineRoom}
                onChange={(e) => {
                  setOnlineRoom(e.target.value.toUpperCase());
                  setRoomError('');
                }}
              />
            </label>
          </div>
          {(roomError || onlineNote) && (
            <p className="note" data-online-note style={{ color: roomError ? 'var(--alarm)' : undefined, fontWeight: roomError ? 600 : undefined }}>
              {roomError || onlineNote}
            </p>
          )}
          <div className="panel__actions">
            <button className="btn btn--primary" type="submit">
              Create or join room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
