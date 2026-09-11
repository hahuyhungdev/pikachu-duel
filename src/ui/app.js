/**
 * Wires two independent sessions built from one shared seed into a duel:
 * identical boards, side by side, first to clear wins.
 */

import { createSession, select, requestHint, requestShuffle, timeOut } from '../game/session.js';
import { randomSeed } from '../game/rng.js';
import { MAX_ICONS } from '../game/icons.js';
import { createBoardView, CLEAR_MS } from './boardView.js';
import { sfx, setMuted, isMuted } from './audio.js';

export const PRESETS = {
  rookie: { label: 'Rookie', rows: 6, cols: 6, iconCount: 9, hints: 5, shuffles: 5 },
  trainer: { label: 'Trainer', rows: 8, cols: 8, iconCount: 14, hints: 3, shuffles: 3 },
  champion: { label: 'Champion', rows: 8, cols: 10, iconCount: MAX_ICONS, hints: 2, shuffles: 2 },
};

const CLOCKS = { 180: '3 min', 300: '5 min', 480: '8 min', 0: 'No clock' };
const STORE_KEY = 'pikachu-duel/setup';

const KEYMAP = [
  {
    player: 0,
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    pick: ['Space', 'KeyF'], hint: ['KeyQ'], shuffle: ['KeyE'],
  },
  {
    player: 1,
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    pick: ['Enter', 'NumpadEnter'], hint: ['Comma'], shuffle: ['Period'],
  },
];

const pad = (n) => String(n).padStart(2, '0');
const clockText = (seconds) => `${pad(Math.floor(Math.max(0, seconds) / 60))}:${pad(Math.max(0, seconds) % 60)}`;

export function mountApp(root) {
  const el = (selector) => root.querySelector(selector);
  const dom = {
    arena: el('[data-arena]'),
    clock: el('[data-clock]'),
    seed: el('[data-seed]'),
    newDuel: [...root.querySelectorAll('[data-action="new"]')],
    rematch: el('[data-action="rematch"]'),
    sound: el('[data-action="sound"]'),
    start: el('[data-overlay="start"]'),
    startForm: el('[data-start-form]'),
    result: el('[data-overlay="result"]'),
    resultBanner: el('[data-result-banner]'),
    scoreboard: el('[data-scoreboard]'),
    playAgain: el('[data-action="play-again"]'),
    freshBoard: el('[data-action="fresh-board"]'),
    toast: el('[data-toast]'),
    cabinets: [...root.querySelectorAll('[data-cabinet]')],
  };

  let players = [];
  let timerId = null;
  let toastId = null;
  let duel = null;

  function saved() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }

  function remember(setup) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(setup));
    } catch {
      /* private mode — preferences just won't persist */
    }
  }

  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    clearTimeout(toastId);
    toastId = setTimeout(() => { dom.toast.hidden = true; }, 2200);
  }

  function readSetup() {
    const data = new FormData(dom.startForm);
    const difficulty = String(data.get('difficulty') ?? 'trainer');
    return {
      names: [
        String(data.get('p1') ?? '').trim().slice(0, 18) || 'Player One',
        String(data.get('p2') ?? '').trim().slice(0, 18) || 'Player Two',
      ],
      difficulty: PRESETS[difficulty] ? difficulty : 'trainer',
      clock: Number(data.get('clock') ?? 300),
    };
  }

  function stats(player) {
    const { session } = player;
    return {
      Score: session.score,
      Pairs: `${session.matchedPairs}/${player.totalPairs}`,
      'Best streak': `×${session.bestStreak}`,
      Misses: session.mistakes,
      'Tiles left': session.board.remaining,
      Finished: player.finishedAt ? clockText(player.finishedAt) : '—',
    };
  }

  function syncPlayer(player) {
    const { session, els } = player;
    els.score.textContent = String(session.score);
    els.pairs.textContent = `${session.matchedPairs}/${player.totalPairs}`;
    els.streak.textContent = `×${session.streak}`;
    els.hints.textContent = String(session.hintsLeft);
    els.shuffles.textContent = String(session.shufflesLeft);
    els.hint.disabled = session.hintsLeft <= 0 || session.status !== 'playing';
    els.shuffle.disabled = session.shufflesLeft <= 0 || session.status !== 'playing';
    els.meter.style.width = `${(session.matchedPairs / player.totalPairs) * 100}%`;
  }

  function handlePick(player, r, c) {
    if (!duel || duel.over || player.session.status !== 'playing') return;
    const result = select(player.session, r, c);

    switch (result.type) {
      case 'select':
        player.view.paintSelection();
        player.view.focusCursor({ r, c });
        sfx.pick();
        break;
      case 'deselect':
        player.view.paintSelection();
        break;
      case 'match':
        player.view.playMatch(result);
        player.view.focusCursor({ r, c });
        sfx.match(player.session.streak);
        if (result.autoShuffled) {
          setTimeout(() => { player.view.render(); sfx.shuffle(); }, CLEAR_MS + 20);
          toast(`${player.session.label}: no moves left — board reshuffled`);
        }
        if (result.won) {
          player.finishedAt = duel.elapsed;
          setTimeout(() => finish('cleared', player), CLEAR_MS + 40);
        }
        break;
      case 'mismatch':
      case 'blocked':
        player.view.paintSelection();
        player.view.focusCursor({ r, c });
        player.view.shake(result.attempted);
        sfx.reject();
        break;
      default:
        break;
    }
    syncPlayer(player);
  }

  function useHint(player) {
    if (!duel || duel.over) return;
    const move = requestHint(player.session);
    if (!move) {
      toast(player.session.hintsLeft <= 0 ? 'No hints left' : 'No move to reveal');
    } else {
      player.view.showHint(move);
      sfx.tick();
    }
    syncPlayer(player);
  }

  function useShuffle(player) {
    if (!duel || duel.over) return;
    if (!requestShuffle(player.session)) {
      toast('No shuffles left');
      return;
    }
    player.view.render();
    player.view.clearHint();
    sfx.shuffle();
    syncPlayer(player);
  }

  function buildPlayer(index, setup, seed) {
    const preset = PRESETS[setup.difficulty];
    const cabinet = dom.cabinets[index];
    const session = createSession({
      rows: preset.rows,
      cols: preset.cols,
      iconCount: preset.iconCount,
      hints: preset.hints,
      shuffles: preset.shuffles,
      seed,
      label: setup.names[index],
    });

    const mount = cabinet.querySelector('[data-board-mount]');
    mount.replaceChildren();

    const player = {
      index,
      session,
      totalPairs: (preset.rows * preset.cols) / 2,
      finishedAt: null,
      els: {
        cabinet,
        name: cabinet.querySelector('[data-role="name"]'),
        score: cabinet.querySelector('[data-role="score"]'),
        pairs: cabinet.querySelector('[data-role="pairs"]'),
        streak: cabinet.querySelector('[data-role="streak"]'),
        hints: cabinet.querySelector('[data-role="hints"]'),
        shuffles: cabinet.querySelector('[data-role="shuffles"]'),
        hint: cabinet.querySelector('[data-action="hint"]'),
        shuffle: cabinet.querySelector('[data-action="shuffle"]'),
        meter: cabinet.querySelector('[data-role="meter"]'),
      },
    };

    player.view = createBoardView({
      mount,
      session,
      onPick: (r, c) => handlePick(player, r, c),
    });

    player.els.name.textContent = session.label;
    cabinet.dataset.state = 'playing';
    player.view.setVeil('');
    player.els.hint.onclick = () => useHint(player);
    player.els.shuffle.onclick = () => useShuffle(player);
    syncPlayer(player);
    return player;
  }

  function tick() {
    if (!duel || duel.over) return;
    duel.elapsed += 1;
    if (duel.limit > 0) {
      const left = duel.limit - duel.elapsed;
      dom.clock.textContent = clockText(left);
      dom.clock.dataset.urgent = left <= 30 ? 'true' : 'false';
      if (left <= 5 && left > 0) sfx.tick();
      if (left <= 0) {
        finish('time');
        return;
      }
    } else {
      dom.clock.textContent = clockText(duel.elapsed);
    }
  }

  function decideWinner(reason, cleared) {
    if (reason === 'cleared') return cleared.index;
    const [a, b] = players;
    if (a.session.matchedPairs !== b.session.matchedPairs) {
      return a.session.matchedPairs > b.session.matchedPairs ? 0 : 1;
    }
    if (a.session.score !== b.session.score) return a.session.score > b.session.score ? 0 : 1;
    return -1;
  }

  function finish(reason, cleared = null) {
    if (!duel || duel.over) return;
    duel.over = true;
    clearInterval(timerId);

    const winner = decideWinner(reason, cleared);
    for (const player of players) {
      if (player.session.status === 'playing') timeOut(player.session);
      const won = player.index === winner;
      player.els.cabinet.dataset.state = won ? 'won' : 'lost';
      player.view.setVeil(
        winner === -1 ? 'Draw' : won ? 'Winner' : 'Beaten',
        won && reason === 'cleared' ? 'Board cleared' : `${player.session.matchedPairs} pairs`,
      );
      syncPlayer(player);
    }

    dom.resultBanner.replaceChildren();
    const lead = document.createElement('span');
    if (winner === -1) {
      dom.resultBanner.append(document.createTextNode('Dead heat'));
    } else {
      lead.textContent = players[winner].session.label;
      dom.resultBanner.append(document.createTextNode('Winner'), lead);
    }

    dom.scoreboard.replaceChildren();
    for (const player of players) {
      const card = document.createElement('article');
      card.className = 'score-card';
      card.dataset.player = String(player.index + 1);
      card.dataset.winner = String(player.index === winner);
      const title = document.createElement('h3');
      title.textContent = player.session.label;
      const list = document.createElement('dl');
      for (const [name, value] of Object.entries(stats(player))) {
        const dt = document.createElement('dt');
        dt.textContent = name;
        const dd = document.createElement('dd');
        dd.textContent = String(value);
        list.append(dt, dd);
      }
      card.append(title, list);
      dom.scoreboard.append(card);
    }

    dom.result.hidden = false;
    dom.playAgain.focus();
    sfx.win();
  }

  function startDuel(setup, seed = randomSeed()) {
    clearInterval(timerId);
    duel = { seed, setup, limit: setup.clock, elapsed: 0, over: false };
    players = [0, 1].map((index) => buildPlayer(index, setup, seed));
    dom.seed.textContent = `#${seed.toString(36).toUpperCase()}`;
    dom.clock.textContent = clockText(setup.clock > 0 ? setup.clock : 0);
    dom.clock.dataset.urgent = 'false';
    dom.start.hidden = true;
    dom.result.hidden = true;
    dom.rematch.disabled = false;
    timerId = setInterval(tick, 1000);
    toast(`${PRESETS[setup.difficulty].label} duel — same board for both players`);
  }

  dom.startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const setup = readSetup();
    remember(setup);
    startDuel(setup);
  });

  for (const button of dom.newDuel) {
    button.addEventListener('click', () => {
      clearInterval(timerId);
      if (duel) duel.over = true;
      dom.result.hidden = true;
      dom.start.hidden = false;
    });
  }

  dom.rematch.addEventListener('click', () => {
    if (duel) startDuel(duel.setup, duel.seed);
  });

  dom.playAgain.addEventListener('click', () => {
    if (duel) startDuel(duel.setup, duel.seed);
  });

  dom.freshBoard.addEventListener('click', () => {
    if (duel) startDuel(duel.setup);
  });

  dom.sound.addEventListener('click', () => {
    const muted = setMuted(!isMuted());
    dom.sound.textContent = muted ? 'Sound off' : 'Sound on';
    dom.sound.setAttribute('aria-pressed', String(!muted));
    if (!muted) sfx.pick();
  });

  window.addEventListener('keydown', (event) => {
    if (!duel || duel.over) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;

    for (const map of KEYMAP) {
      const player = players[map.player];
      if (!player || player.session.status !== 'playing') continue;

      if (map.up.includes(event.code)) { event.preventDefault(); player.view.moveCursor(-1, 0); return; }
      if (map.down.includes(event.code)) { event.preventDefault(); player.view.moveCursor(1, 0); return; }
      if (map.left.includes(event.code)) { event.preventDefault(); player.view.moveCursor(0, -1); return; }
      if (map.right.includes(event.code)) { event.preventDefault(); player.view.moveCursor(0, 1); return; }
      if (map.pick.includes(event.code)) {
        event.preventDefault();
        const point = player.view.cursorAt();
        if (point) handlePick(player, point.r, point.c);
        return;
      }
      if (map.hint.includes(event.code)) { event.preventDefault(); useHint(player); return; }
      if (map.shuffle.includes(event.code)) { event.preventDefault(); useShuffle(player); return; }
    }
  });

  /**
   * A duel can be handed over as a link:
   *   ?p1=Ash&p2=Misty&board=champion&clock=300&seed=1a2b3c&auto=1
   * Sharing the seed means both people can play the exact same deal.
   */
  function fromQuery() {
    const params = new URLSearchParams(location.search);
    if ([...params.keys()].length === 0) return null;
    const seedParam = params.get('seed');
    const parsedSeed = seedParam ? parseInt(seedParam, 36) : NaN;
    return {
      names: [params.get('p1'), params.get('p2')],
      difficulty: PRESETS[params.get('board')] ? params.get('board') : null,
      clock: params.has('clock') ? Number(params.get('clock')) : null,
      seed: Number.isSafeInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : null,
      auto: params.get('auto') === '1' || Boolean(seedParam),
    };
  }

  // Restore the last setup so a rematch is two clicks away.
  const previous = saved();
  if (previous.names) {
    dom.startForm.elements.p1.value = previous.names[0] ?? '';
    dom.startForm.elements.p2.value = previous.names[1] ?? '';
  }
  if (previous.difficulty && PRESETS[previous.difficulty]) {
    dom.startForm.elements.difficulty.value = previous.difficulty;
  }
  if (previous.clock !== undefined && CLOCKS[previous.clock] !== undefined) {
    dom.startForm.elements.clock.value = String(previous.clock);
  }

  const query = fromQuery();
  if (query) {
    const form = dom.startForm.elements;
    if (query.names[0]) form.p1.value = query.names[0].slice(0, 18);
    if (query.names[1]) form.p2.value = query.names[1].slice(0, 18);
    if (query.difficulty) form.difficulty.value = query.difficulty;
    if (query.clock !== null && CLOCKS[query.clock] !== undefined) form.clock.value = String(query.clock);
    if (query.auto) startDuel(readSetup(), query.seed ?? randomSeed());
  }

  return { startDuel, get duel() { return duel; } };
}
