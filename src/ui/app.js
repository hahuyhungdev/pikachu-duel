/**
 * Duel orchestration, in two modes.
 *
 * Local: two sessions from one seed, side by side on this screen.
 * Online: my session here, my opponent's progress mirrored from the relay. The
 * relay is the authority on the seed and on who won; this file never decides a
 * winner in online mode.
 */

import { createSession, select, requestHint, requestShuffle, timeOut } from '../game/session.js';
import { randomSeed } from '../game/rng.js';
import { PRESETS, calculateNextLevel, normalizeDifficulty } from '../shared/game/presets.js';
import { createBoardView, CLEAR_MS } from './boardView.js';
import { sfx, setMuted, isMuted } from './audio.js';
import { createRelay } from '../net/client.js';
import { isRelayConfigured, isRoomCode, newRoomCode } from '../net/config.js';
import { createLobbyView } from './lobby.js';

export { PRESETS };

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

const RELAY_ERRORS = {
  room_full: 'That room already has two players.',
  not_host: 'Only the host can do that.',
  need_two: 'Waiting for a second player.',
  in_progress: 'The duel is already running.',
  bad_code: 'That room code is not valid.',
  too_fast: 'Disconnected for sending too much.',
};

const pad = (n) => String(n).padStart(2, '0');
const clockText = (seconds) => `${pad(Math.floor(Math.max(0, seconds) / 60))}:${pad(Math.max(0, seconds) % 60)}`;

export function mountApp(root) {
  const lifecycle = new AbortController();
  const el = (selector) => root.querySelector(selector);
  const dom = {
    arena: el('[data-arena]'),
    clock: el('[data-clock]'),
    seed: el('[data-seed]'),
    levelBadge: el('[data-level]'),
    newDuel: [...root.querySelectorAll('[data-action="new"]')],
    rematch: el('[data-action="rematch"]'),
    sound: el('[data-action="sound"]'),
    start: el('[data-overlay="start"]'),
    startForm: el('[data-start-form]'),
    result: el('[data-overlay="result"]'),
    resultBanner: el('[data-result-banner]'),
    scoreboard: el('[data-scoreboard]'),
    nextLevel: el('[data-action="next-level"]'),
    playAgain: el('[data-action="play-again"]'),
    freshBoard: el('[data-action="fresh-board"]'),
    toast: el('[data-toast]'),
    cabinets: [...root.querySelectorAll('[data-cabinet]')],
    modeButtons: [...root.querySelectorAll('[data-mode-btn]')],
    fieldP2: el('[data-field-p2]'),
    p1Label: el('[data-p1-label]'),
    startSubmit: el('[data-start-submit]'),
    rulesGoal: el('[data-rules-goal]'),
    onlineForm: el('[data-online-form]'),
    onlineNote: el('[data-online-note]'),
    linkState: el('[data-link-state]'),
    lobby: el('[data-overlay="lobby"]'),
    lobbyCode: el('[data-lobby-code]'),
    lobbyStatus: el('[data-lobby-status]'),
    lobbySeats: el('[data-lobby-seats]'),
    lobbySettings: el('[data-lobby-settings]'),
    lobbyDifficulty: el('[data-lobby-difficulty]'),
    lobbyClock: el('[data-lobby-clock]'),
    inviteLink: el('[data-invite-link]'),
    copyInvite: el('[data-action="copy-invite"]'),
    hostStart: el('[data-action="host-start"]'),
    leaveRoom: el('[data-action="leave-room"]'),
  };

  let players = [];
  let timerId = null;
  let toastId = null;
  let duel = null;
  let net = null;

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

  function updateLevelDisplay(level, difficulty) {
    if (!dom.levelBadge) return;
    const preset = PRESETS[difficulty] ?? PRESETS.normal;
    const diffLabel = preset.difficultyLabel ?? (difficulty === 'easy' ? 'Easy' : difficulty === 'hard' ? 'Hard' : 'Medium');
    dom.levelBadge.textContent = `Level ${level} · ${diffLabel}`;
  }

  function readSetup() {
    const data = new FormData(dom.startForm);
    const rawDifficulty = String(data.get('difficulty') ?? 'normal');
    const difficulty = normalizeDifficulty(rawDifficulty);
    const activeModeBtn = dom.modeButtons.find((b) => b.getAttribute('aria-selected') === 'true');
    const mode = activeModeBtn?.dataset.modeBtn === 'solo' ? 'solo' : 'local';
    const p1Fallback = mode === 'solo' ? 'Player' : 'Player One';
    return {
      mode,
      names: [
        String(data.get('p1') ?? '').trim().slice(0, 18) || p1Fallback,
        String(data.get('p2') ?? '').trim().slice(0, 18) || 'Player Two',
      ],
      difficulty,
      clock: Number(data.get('clock') ?? 300),
      level: 1,
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
    if (els.bigPairs) els.bigPairs.textContent = String(session.matchedPairs);
    if (els.bigTotal) els.bigTotal.textContent = `of ${player.totalPairs} pairs cleared`;
  }

  function setRemoteState(text) {
    const readout = players[1]?.els?.remoteState;
    if (readout) readout.textContent = text;
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
          if (duel.mode === 'online') {
            reportFinish(player, 'cleared');
          } else {
            setTimeout(() => finish('cleared', player.index), CLEAR_MS + 40);
          }
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
    if (duel.mode === 'online' && player.index === 0) {
      net?.relay?.pushProgress({
        score: player.session.score,
        pairs: player.session.matchedPairs,
        streak: player.session.streak,
      });
    }
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
        remotePanel: cabinet.querySelector('[data-remote-panel]'),
        remoteState: cabinet.querySelector('[data-role="remote-state"]'),
        bigPairs: cabinet.querySelector('[data-role="big-pairs"]'),
        bigTotal: cabinet.querySelector('[data-role="big-total"]'),
      },
    };

    player.view = createBoardView({
      mount,
      session,
      onPick: (r, c) => handlePick(player, r, c),
    });

    player.els.name.textContent = session.label;
    const badge = cabinet.querySelector('.badge');
    if (badge) badge.textContent = setup.mode === 'solo' ? 'SOLO' : `P${index + 1}`;
    const keys = cabinet.querySelector('.tools__keys');
    if (keys && setup.mode === 'solo') {
      keys.textContent = 'WASD or Arrows move · Space or Enter pick';
    }
    cabinet.dataset.state = 'playing';
    delete cabinet.dataset.remote;
    if (player.els.remotePanel) player.els.remotePanel.hidden = true;
    player.view.setVeil('');
    player.els.hint.onclick = () => useHint(player);
    player.els.shuffle.onclick = () => useShuffle(player);
    syncPlayer(player);
    return player;
  }

  /**
   * The opponent in online mode. No board and no session — just the figures the
   * relay sends us, shaped like a session so syncPlayer and stats work unchanged.
   */
  function buildRemotePlayer(index, setup, name) {
    const preset = PRESETS[setup.difficulty];
    const cabinet = dom.cabinets[index];
    const totalPairs = (preset.rows * preset.cols) / 2;

    cabinet.querySelector('[data-board-mount]').replaceChildren();
    cabinet.dataset.remote = 'true';
    cabinet.dataset.state = 'playing';

    const player = {
      index,
      remote: true,
      totalPairs,
      finishedAt: null,
      session: {
        label: name,
        score: 0,
        matchedPairs: 0,
        streak: 0,
        bestStreak: 0,
        mistakes: 0,
        hintsLeft: 0,
        shufflesLeft: 0,
        status: 'playing',
        board: { remaining: totalPairs * 2 },
      },
      // A board view this player does not have; finish() may still call these.
      view: { setVeil() {}, render() {}, clearHint() {}, paintSelection() {} },
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
        remotePanel: cabinet.querySelector('[data-remote-panel]'),
        remoteState: cabinet.querySelector('[data-role="remote-state"]'),
        bigPairs: cabinet.querySelector('[data-role="big-pairs"]'),
        bigTotal: cabinet.querySelector('[data-role="big-total"]'),
      },
    };

    player.els.name.textContent = name;
    player.els.remotePanel.hidden = false;
    player.els.remoteState.textContent = 'Playing…';
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
        if (duel.mode === 'online') {
          reportFinish(players[0], 'timeup');
          clearInterval(timerId);
          setRemoteState('Time — waiting for the opponent…');
        } else if (duel.mode === 'solo') {
          finish('time', -1);
        } else {
          finish('time', decideWinner());
        }
        return;
      }
    } else {
      dom.clock.textContent = clockText(duel.elapsed);
    }
  }

  /** Local mode only: who is ahead when the clock runs out. */
  function decideWinner() {
    const [a, b] = players;
    if (!b) return 0;
    if (a.session.matchedPairs !== b.session.matchedPairs) {
      return a.session.matchedPairs > b.session.matchedPairs ? 0 : 1;
    }
    if (a.session.score !== b.session.score) return a.session.score > b.session.score ? 0 : 1;
    return -1;
  }

  function finish(reason, winner = -1) {
    if (!duel || duel.over) return;
    duel.over = true;
    clearInterval(timerId);

    const isSolo = duel.mode === 'solo';

    for (const player of players) {
      if (player.session.status === 'playing') timeOut(player.session);
      const won = isSolo ? reason === 'cleared' : player.index === winner;
      player.els.cabinet.dataset.state = won ? 'won' : 'lost';
      if (isSolo) {
        player.view.setVeil(
          won ? 'Stage Cleared!' : "Time's Up!",
          won ? `Finished in ${clockText(duel.elapsed)}` : `${player.session.matchedPairs} pairs`,
        );
      } else {
        player.view.setVeil(
          winner === -1 ? 'Draw' : won ? 'Winner' : 'Beaten',
          won && reason === 'cleared' ? 'Board cleared' : `${player.session.matchedPairs} pairs`,
        );
      }
      syncPlayer(player);
    }

    dom.resultBanner.replaceChildren();
    if (isSolo) {
      const won = reason === 'cleared';
      const lead = document.createElement('span');
      if (won) {
        lead.textContent = players[0].session.label;
        dom.resultBanner.append(document.createTextNode('Stage Cleared! Great job, '), lead);
      } else {
        dom.resultBanner.append(document.createTextNode("Time's up! Try again."));
      }
    } else {
      const lead = document.createElement('span');
      if (winner === -1) {
        dom.resultBanner.append(document.createTextNode('Dead heat'));
      } else {
        lead.textContent = players[winner].session.label;
        dom.resultBanner.append(document.createTextNode('Winner'), lead);
      }
    }

    dom.scoreboard.replaceChildren();
    for (const player of players) {
      const card = document.createElement('article');
      card.className = 'score-card';
      card.dataset.player = String(player.index + 1);
      card.dataset.winner = String(isSolo ? reason === 'cleared' : player.index === winner);
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
    if (dom.nextLevel) {
      const next = calculateNextLevel(duel.setup.difficulty, duel.level ?? 1, duel.setup.clock);
      const nextPreset = PRESETS[next.difficulty] ?? PRESETS.hard;
      const nextDiffText = next.difficulty === 'hard' && duel.setup.difficulty === 'hard'
        ? `Hard (${next.clock}s)`
        : (nextPreset.difficultyLabel ?? nextPreset.label);
      dom.nextLevel.textContent = `Next level: Level ${next.level} (${nextDiffText})`;
      dom.nextLevel.disabled = duel.mode === 'online' && !iAmHost();
      dom.nextLevel.focus();
    } else {
      dom.playAgain.focus();
    }
    if (isSolo ? reason === 'cleared' : winner !== -1) {
      sfx.win();
    } else {
      sfx.reject();
    }
  }

  function advanceNextLevel() {
    if (!duel) return;
    const next = calculateNextLevel(duel.setup.difficulty, duel.level ?? 1, duel.setup.clock);
    const nextSetup = {
      ...duel.setup,
      difficulty: next.difficulty,
      clock: next.clock,
      level: next.level,
    };
    if (duel.mode === 'online') {
      if (!iAmHost()) {
        toast('Only the host can advance to the next level');
        return;
      }
      net.relay.send({
        t: 'settings',
        difficulty: next.difficulty,
        clock: next.clock,
      });
      net.relay.send({ t: 'rematch', sameSeed: false });
      return;
    }
    startDuel(nextSetup, randomSeed());
  }

  function startDuel(setup, seed = randomSeed()) {
    clearInterval(timerId);
    leaveRelay();
    const mode = setup.mode ?? 'local';
    dom.arena.dataset.mode = mode;
    dom.lobby.hidden = true;
    const level = setup.level ?? 1;
    duel = { mode, seed, setup, limit: setup.clock, elapsed: 0, over: false, level };
    if (mode === 'solo') {
      players = [buildPlayer(0, setup, seed)];
      if (dom.cabinets[1]) dom.cabinets[1].hidden = true;
    } else {
      if (dom.cabinets[1]) dom.cabinets[1].hidden = false;
      players = [0, 1].map((index) => buildPlayer(index, setup, seed));
    }
    dom.seed.textContent = `#${seed.toString(36).toUpperCase()}`;
    dom.clock.textContent = clockText(setup.clock > 0 ? setup.clock : 0);
    dom.clock.dataset.urgent = 'false';
    dom.start.hidden = true;
    dom.result.hidden = true;
    dom.rematch.disabled = false;
    timerId = setInterval(tick, 1000);
    updateLevelDisplay(level, setup.difficulty);
    const diffInfo = PRESETS[setup.difficulty] ?? PRESETS.normal;
    const diffName = diffInfo.difficultyLabel ?? 'Medium';
    if (mode === 'solo') {
      toast(`Level ${level} · ${diffName} (${diffInfo.label}) solo — clear the board before time runs out!`);
    } else {
      toast(`Level ${level} · ${diffName} (${diffInfo.label}) duel — same board for both players`);
    }
  }

  dom.startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const setup = readSetup();
    remember(setup);
    startDuel(setup);
  });

  for (const button of dom.newDuel) {
    button.addEventListener('click', () => {
      if (net) {
        leaveRoom();
        return;
      }
      clearInterval(timerId);
      if (duel) duel.over = true;
      dom.result.hidden = true;
      dom.start.hidden = false;
      if (dom.cabinets[1]) dom.cabinets[1].hidden = false;
    });
  }

  if (dom.nextLevel) dom.nextLevel.addEventListener('click', advanceNextLevel);
  dom.rematch.addEventListener('click', () => requestRematch(true));
  dom.playAgain.addEventListener('click', () => requestRematch(true));
  dom.freshBoard.addEventListener('click', () => requestRematch(false));

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
      const playerIndex = duel.mode === 'solo' ? 0 : map.player;
      const player = players[playerIndex];
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
  }, { signal: lifecycle.signal });

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
    const rawDiff = params.get('difficulty') ?? params.get('board');
    const diff = rawDiff ? normalizeDifficulty(rawDiff) : null;
    const modeParam = params.get('mode');
    return {
      mode: modeParam === 'solo' ? 'solo' : modeParam === 'local' ? 'local' : null,
      room: params.get('room'),
      name: params.get('name'),
      names: [params.get('p1'), params.get('p2')],
      difficulty: diff,
      clock: params.has('clock') ? Number(params.get('clock')) : null,
      seed: Number.isSafeInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : null,
      auto: params.get('auto') === '1' || Boolean(seedParam),
    };
  }

  /** An invite link lands here: open the online pane with the code filled in. */
  function openInvite(query) {
    const code = String(query.room).toUpperCase();
    showMode('online');
    dom.onlineForm.elements.room.value = code;
    const remembered = saved().onlineName ?? '';
    const name = (query.name ?? remembered).trim?.() ?? '';
    dom.onlineForm.elements.name.value = name;

    if (!isRelayConfigured()) {
      note('This copy of the game has no relay configured, so online play is off.');
      return;
    }
    if (name) {
      enterRoom(code, name.slice(0, 18));
      return;
    }
    note(`You were invited to room ${code}. Put your name in and join.`);
    dom.onlineForm.elements.name.focus();
  }


  // ---------------------------------------------------------------- online

  const lobbyView = createLobbyView({ dom, getNet: () => net });
  const { note, showMode, render: renderLobby, setLinkStatus } = lobbyView;

  const iAmHost = () => Boolean(net && net.you && net.you === net.hostId);

  function leaveRelay() {
    net?.relay?.close();
    net = null;
    dom.linkState.hidden = true;
  }

  function onLinkStatus(status) {
    if (!net) return;
    net.link = status.state;
    setLinkStatus(status);
  }

  function enterRoom(code, name) {
    leaveRelay();
    net = {
      code,
      name,
      you: null,
      hostId: null,
      foeId: null,
      players: [],
      settings: { difficulty: 'normal', clock: 300 },
      status: 'lobby',
      link: 'connecting',
      relay: null,
    };
    dom.start.hidden = true;
    dom.result.hidden = true;
    dom.lobby.hidden = false;
    renderLobby();
    net.relay = createRelay({ code, name, onMessage: onNetMessage, onStatus: onLinkStatus });
    remember({ ...saved(), onlineName: name });
  }

  function leaveRoom() {
    leaveRelay();
    clearInterval(timerId);
    if (duel) duel.over = true;
    dom.lobby.hidden = true;
    dom.result.hidden = true;
    dom.start.hidden = false;
    dom.arena.dataset.mode = 'local';
    if (dom.cabinets[1]) dom.cabinets[1].hidden = false;
  }

  function reportFinish(player, reason) {
    if (!net?.relay || !duel || duel.reported) return;
    duel.reported = true;
    net.relay.flush();
    net.relay.send({
      t: 'finish',
      reason,
      score: player.session.score,
      pairs: player.session.matchedPairs,
      elapsed: duel.elapsed,
    });
    setRemoteState(reason === 'cleared' ? 'You cleared it — confirming…' : 'Time up — waiting…');
  }

  function startOnlineRound({ seed, settings, players: roster }) {
    clearInterval(timerId);
    const mine = roster.find((p) => p.id === net.you);
    const theirs = roster.find((p) => p.id !== net.you);
    net.foeId = theirs?.id ?? null;
    net.status = 'playing';

    const normalizedDiff = normalizeDifficulty(settings.difficulty);
    const setup = {
      difficulty: normalizedDiff,
      clock: Number(settings.clock) || 0,
      names: [mine?.name ?? net.name, theirs?.name ?? 'Opponent'],
      level: PRESETS[normalizedDiff]?.level ?? 2,
    };

    duel = { mode: 'online', seed, setup, limit: setup.clock, elapsed: 0, over: false, reported: false, level: setup.level };
    dom.arena.dataset.mode = 'online';
    if (dom.cabinets[1]) dom.cabinets[1].hidden = false;
    players = [buildPlayer(0, setup, seed), buildRemotePlayer(1, setup, setup.names[1])];

    dom.seed.textContent = `#${Number(seed).toString(36).toUpperCase()}`;
    dom.clock.textContent = clockText(setup.clock > 0 ? setup.clock : 0);
    dom.clock.dataset.urgent = 'false';
    dom.lobby.hidden = true;
    dom.start.hidden = true;
    dom.result.hidden = true;
    dom.rematch.disabled = !iAmHost();
    timerId = setInterval(tick, 1000);
    updateLevelDisplay(setup.level, setup.difficulty);
    toast(`Duel on — same board as ${setup.names[1]}`);
  }

  function applyRemoteProgress(msg) {
    const foe = players[1];
    if (!duel || duel.mode !== 'online' || !foe?.remote || msg.from === net?.you) return;
    foe.session.score = msg.score;
    foe.session.matchedPairs = msg.pairs;
    foe.session.streak = msg.streak;
    foe.session.bestStreak = Math.max(foe.session.bestStreak, msg.streak);
    foe.session.board.remaining = Math.max(0, foe.totalPairs * 2 - msg.pairs * 2);
    syncPlayer(foe);
  }

  function applyRemoteResult(msg) {
    if (!duel || duel.mode !== 'online') return;
    const foe = players[1];
    const theirs = (msg.players ?? []).find((p) => p.id === net?.foeId);
    if (foe?.remote && theirs) {
      foe.session.score = theirs.score;
      foe.session.matchedPairs = theirs.pairs;
      foe.session.status = 'lost';
      foe.finishedAt = theirs.elapsed ?? null;
      foe.session.board.remaining = Math.max(0, foe.totalPairs * 2 - theirs.pairs * 2);
      syncPlayer(foe);
    }
    const winner = msg.winner === null || msg.winner === undefined ? -1 : msg.winner === net.you ? 0 : 1;
    net.status = 'over';
    finish(msg.reason, winner);
    setRemoteState(winner === 1 ? 'Winner' : winner === -1 ? 'Draw' : 'Beaten');
  }

  function onNetMessage(msg) {
    if (!net) return;
    switch (msg.t) {
      case 'welcome':
        net.you = msg.you;
        net.hostId = msg.hostId;
        net.settings = msg.settings;
        net.players = msg.players;
        net.status = msg.status;
        renderLobby();
        break;
      case 'peers':
        net.hostId = msg.hostId;
        net.players = msg.players;
        if (duel?.mode === 'online' && players[1]?.remote) {
          const theirs = msg.players.find((p) => p.id !== net.you);
          if (theirs) players[1].els.name.textContent = theirs.name;
        }
        renderLobby();
        break;
      case 'settings':
        net.settings = msg.settings;
        renderLobby();
        break;
      case 'start':
        startOnlineRound(msg);
        break;
      case 'progress':
        applyRemoteProgress(msg);
        break;
      case 'result':
        applyRemoteResult(msg);
        break;
      case 'peer_left':
        if (msg.from !== net.you) {
          toast(`${msg.name} disconnected`);
          if (duel?.mode === 'online' && !duel.over) setRemoteState('Disconnected — keep going');
        }
        break;
      case 'error':
        toast(RELAY_ERRORS[msg.code] ?? `Relay: ${msg.code}`);
        if (msg.code === 'room_full') {
          leaveRoom();
          showMode('online');
          note('That room is full. Create a new one, or ask for a fresh link.');
        }
        break;
      default:
        break;
    }
  }

  /** Online rematches go through the host; local ones are immediate. */
  function requestRematch(sameSeed) {
    if (duel?.mode === 'online') {
      if (!iAmHost()) {
        toast('Only the host can start the next round');
        return;
      }
      net.relay.send({ t: 'rematch', sameSeed });
      return;
    }
    if (duel) startDuel(duel.setup, sameSeed ? duel.seed : randomSeed());
  }

  for (const button of dom.modeButtons) {
    button.addEventListener('click', () => showMode(button.dataset.modeBtn));
  }

  dom.onlineForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(dom.onlineForm);
    const name = String(data.get('name') ?? '').trim().slice(0, 18) || 'Player';
    const typed = String(data.get('room') ?? '').trim().toUpperCase();
    if (typed && !isRoomCode(typed)) {
      note('A room code is 4-12 letters and digits, like K7M2QB.');
      return;
    }
    if (!isRelayConfigured()) {
      note('This copy of the game has no relay yet, so online play is off. Deploy the Worker in server/ and set RELAY_URL in src/net/config.js.');
      return;
    }
    enterRoom(typed || newRoomCode(), name);
  });

  dom.copyInvite.addEventListener('click', async () => {
    dom.inviteLink.select();
    try {
      await navigator.clipboard.writeText(dom.inviteLink.value);
      toast('Invite link copied');
    } catch {
      toast('Press Ctrl+C to copy the selected link');
    }
  });

  dom.hostStart.addEventListener('click', () => net?.relay?.send({ t: 'start' }));
  dom.leaveRoom.addEventListener('click', leaveRoom);

  for (const control of [dom.lobbyDifficulty, dom.lobbyClock]) {
    control.addEventListener('change', () => {
      if (!iAmHost()) return;
      net.relay.send({
        t: 'settings',
        difficulty: dom.lobbyDifficulty.value,
        clock: Number(dom.lobbyClock.value),
      });
    });
  }

  window.addEventListener('beforeunload', () => net?.relay?.close(), { signal: lifecycle.signal });


  // ------------------------------------------------------------- start-up
  // Runs last: everything above, including the lobby view, must exist first.

  function restorePreferences() {
    const previous = saved();
    if (previous.mode && ['solo', 'local'].includes(previous.mode)) {
      showMode(previous.mode);
    }
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
    if (previous.onlineName) dom.onlineForm.elements.name.value = previous.onlineName;
  }

  function applyQuery(query) {
    if (query.mode) showMode(query.mode);
    const form = dom.startForm.elements;
    if (query.names[0]) form.p1.value = query.names[0].slice(0, 18);
    if (query.names[1]) form.p2.value = query.names[1].slice(0, 18);
    if (query.difficulty) form.difficulty.value = query.difficulty;
    if (query.clock !== null && CLOCKS[query.clock] !== undefined) form.clock.value = String(query.clock);
    if (query.auto) startDuel(readSetup(), query.seed ?? randomSeed());
  }

  showMode('local');
  restorePreferences();

  const query = fromQuery();
  if (query?.room && isRoomCode(String(query.room))) openInvite(query);
  else if (query) applyQuery(query);

  return {
    startDuel,
    enterRoom,
    get duel() { return duel; },
    destroy() {
      lifecycle.abort();
      clearInterval(timerId);
      clearTimeout(toastId);
      if (duel) duel.over = true;
      leaveRelay();
    },
  };
}
