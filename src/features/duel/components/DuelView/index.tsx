import type { RefObject } from 'react';

interface DuelViewProps {
  rootRef: RefObject<HTMLDivElement | null>;
}

function PlayerCabinet({ player }: { player: 1 | 2 }) {
  const first = player === 1;
  return (
    <section className="cabinet" data-cabinet data-player={player} data-state="playing">
      <header className="cabinet__head">
        <div className="who">
          <span className="badge">P{player}</span>
          <h2 data-role="name">Player {first ? 'One' : 'Two'}</h2>
        </div>
        <dl className="stats">
          <div><dt>Score</dt><dd data-role="score">0</dd></div>
          <div><dt>Pairs</dt><dd data-role="pairs">0/72</dd></div>
          <div><dt>Streak</dt><dd data-role="streak">×0</dd></div>
        </dl>
      </header>
      <div className="meter"><span className="meter__fill" data-role="meter" /></div>
      <div data-board-mount />
      {!first && (
        <div className="remote" data-remote-panel hidden>
          <p className="remote__figure">
            <strong data-role="big-pairs">0</strong>
            <span data-role="big-total">of 72 pairs cleared</span>
          </p>
          <p className="remote__state" data-role="remote-state">Waiting for the duel to start…</p>
        </div>
      )}
      <footer className="tools">
        <div className="hud__actions">
          <button className="btn" type="button" data-action="hint">
            Hint <kbd>{first ? 'Q' : ','}</kbd><span className="count" data-role="hints">2</span>
          </button>
          <button className="btn" type="button" data-action="shuffle">
            Shuffle <kbd>{first ? 'E' : '.'}</kbd><span className="count" data-role="shuffles">2</span>
          </button>
        </div>
        <p className="tools__keys">
          {first ? <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></> : <><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></>} move · <kbd>{first ? 'Space' : 'Enter'}</kbd> pick
        </p>
      </footer>
    </section>
  );
}

function StartOverlay() {
  return (
    <div className="overlay" data-overlay="start">
      <div className="panel">
        <div className="panel__eyebrow">Original link-match challenge</div>
        <h1 aria-label="Pikachu Duel"><span>Pikachu</span><em>Duel</em></h1>
        <p className="panel__lede">
          Race across the same Pokémon grid. Link identical characters with no more than two turns and clear all 72 pairs first.
        </p>

        <div className="modes" role="tablist" aria-label="How you want to play">
          <button className="mode" type="button" role="tab" data-mode-btn="solo" aria-selected="false">
            Solo<small>One player against the clock</small>
          </button>
          <button className="mode" type="button" role="tab" data-mode-btn="local" aria-selected="true">
            Same computer<small>Two players, one keyboard</small>
          </button>
          <button className="mode" type="button" role="tab" data-mode-btn="online" aria-selected="false">
            Online<small>Share a room link</small>
          </button>
        </div>

        <form data-online-form hidden>
          <div className="setup">
            <label className="field" htmlFor="online-name">Your name
              <input id="online-name" name="name" type="text" maxLength={18} placeholder="Player One" autoComplete="off" />
            </label>
            <label className="field" htmlFor="online-room">Room code <small>(blank creates one)</small>
              <input id="online-room" name="room" type="text" maxLength={12} placeholder="e.g. K7M2QB" autoComplete="off" autoCapitalize="characters" spellCheck={false} />
            </label>
          </div>
          <div className="panel__actions">
            <button className="btn btn--primary" type="submit">Create or join room</button>
            <span className="tools__keys">Both players receive the exact same deal.</span>
          </div>
          <p className="note" data-online-note hidden />
        </form>

        <form data-start-form>
          <div className="setup">
            <label className="field" data-field-p1>
              <span data-p1-label>Player 1 name</span>
              <input name="p1" type="text" maxLength={18} placeholder="Player One" autoComplete="off" />
            </label>
            <label className="field" data-field-p2>
              <span>Player 2 name</span>
              <input name="p2" type="text" maxLength={18} placeholder="Player Two" autoComplete="off" />
            </label>
            <label className="field">Board / Difficulty
              <select name="difficulty" defaultValue="normal">
                <option value="easy">Easy — Quick · 8 × 10 · 16 Pokémon</option>
                <option value="normal">Medium — Classic · 9 × 16 · 24 Pokémon</option>
                <option value="hard">Hard — Grand · 12 × 16 · 24 Pokémon</option>
              </select>
            </label>
            <label className="field">Clock
              <select name="clock" defaultValue="300">
                <option value="180">3 minutes</option>
                <option value="300">5 minutes</option>
                <option value="480">8 minutes</option>
                <option value="0">No clock</option>
              </select>
            </label>
          </div>

          <div className="rules-brief">
            <div><span>01</span><p>Match two identical Pokémon.</p></div>
            <div><span>02</span><p>Connect through empty space with ≤ 2 turns.</p></div>
            <div><span>03</span><p data-rules-goal>Clear the mirrored grid before your rival.</p></div>
          </div>

          <div className="panel__actions">
            <button className="btn btn--primary" type="submit" data-start-submit>Start duel</button>
            <span className="tools__keys">Default arena: 16 columns × 9 rows.</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function LobbyOverlay() {
  return (
    <div className="overlay" data-overlay="lobby" hidden>
      <div className="panel">
        <div className="panel__eyebrow">Online room</div>
        <h1>Room <em data-lobby-code>······</em></h1>
        <p className="panel__lede" data-lobby-status>Connecting to the relay…</p>
        <div className="invite">
          <input type="text" readOnly data-invite-link aria-label="Invite link to share" />
          <button className="btn" type="button" data-action="copy-invite">Copy link</button>
        </div>
        <ol className="seats" data-lobby-seats />
        <div className="setup" data-lobby-settings hidden>
          <label className="field" htmlFor="lobby-difficulty">Board / Difficulty
            <select id="lobby-difficulty" data-lobby-difficulty defaultValue="normal">
              <option value="easy">Easy — Quick · 8 × 10 · 16 Pokémon</option>
              <option value="normal">Medium — Classic · 9 × 16 · 24 Pokémon</option>
              <option value="hard">Hard — Grand · 12 × 16 · 24 Pokémon</option>
            </select>
          </label>
          <label className="field" htmlFor="lobby-clock">Clock
            <select id="lobby-clock" data-lobby-clock defaultValue="300">
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
              <option value="480">8 minutes</option>
              <option value="0">No clock</option>
            </select>
          </label>
        </div>
        <div className="panel__actions">
          <button className="btn btn--primary" type="button" data-action="host-start" disabled>Start duel</button>
          <button className="btn" type="button" data-action="leave-room">Leave room</button>
        </div>
      </div>
    </div>
  );
}

export function DuelView({ rootRef }: DuelViewProps) {
  return (
    <div className="shell" data-app ref={rootRef}>
      <header className="hud">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">P</span>
          <span>Pikachu <em>Duel</em></span>
          <span className="level-badge" data-level>Level 1 · Medium</span>
          <span className="seed" data-seed>#—</span>
        </div>
        <output className="clock" data-clock aria-label="Match clock">05:00</output>
        <div className="hud__actions">
          <button className="btn" type="button" data-action="rematch" disabled>Rematch</button>
          <button className="btn" type="button" data-action="new">New duel</button>
          <button className="btn" type="button" data-action="sound" aria-pressed="true">Sound on</button>
          <span className="link-state" data-link-state hidden />
        </div>
      </header>

      <main className="arena" data-arena>
        <PlayerCabinet player={1} />
        <PlayerCabinet player={2} />
      </main>

      <StartOverlay />
      <LobbyOverlay />

      <div className="overlay" data-overlay="result" hidden>
        <div className="panel panel--result">
          <p className="result__banner" data-result-banner />
          <div className="scoreboard" data-scoreboard />
          <div className="panel__actions">
            <button className="btn btn--primary" type="button" data-action="next-level">Next level</button>
            <button className="btn" type="button" data-action="play-again">Same board again</button>
            <button className="btn" type="button" data-action="fresh-board">Fresh board</button>
            <button className="btn" type="button" data-action="new">Change settings</button>
          </div>
        </div>
      </div>

      <div className="toast" data-toast hidden />
    </div>
  );
}
