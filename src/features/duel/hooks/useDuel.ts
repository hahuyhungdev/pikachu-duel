import { useCallback, useEffect, useRef, useState } from 'react';
import { createBoard, inBounds, isEmpty } from '../../../game/board.js';
import { randomSeed } from '../../../game/rng.js';
import {
  createSession,
  expireCombo,
  requestHint,
  requestShuffle,
  select,
  timeOut,
} from '../../../game/session.js';
import { createRelay } from '../../../net/client.js';
import { isRelayConfigured, newRoomCode, inviteLink } from '../../../net/config.js';
import { isMuted, setMuted, sfx } from '../../../shared/audio/sfx';
import {
  calculateNextLevel,
  normalizeDifficulty,
  PRESETS,
} from '../../../shared/game/presets.js';
import type {
  ActiveDuel,
  Difficulty,
  DuelMode,
  DuelSetup,
  DuelRules,
  OnlinePeer,
  OnlineState,
  PlayerSession,
  PlayerState,
  Point,
} from '../types/duel.types';

interface RelayMessage {
  t: string;
  you?: string;
  hostId?: string;
  foeId?: string;
  players?: OnlinePeer[];
  settings?: { difficulty: Difficulty; clock: number; rules?: DuelRules };
  status?: 'lobby' | 'playing' | 'over';
  seed?: number;
  score?: number;
  pairs?: number;
  streak?: number;
  reason?: 'cleared' | 'time' | 'disconnect';
  winner?: string | null;
  name?: string;
  code?: string;
}

interface RelayInstance {
  close: () => void;
  send: (msg: Record<string, unknown>) => boolean;
  pushProgress: (stats: Record<string, unknown>) => void;
  flush: () => void;
}

const STORE_KEY = 'pikachu-duel/setup';

const KEYMAP = [
  {
    player: 0,
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    pick: ['Space', 'KeyF'],
    hint: ['KeyQ'],
    shuffle: ['KeyE'],
  },
  {
    player: 1,
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    pick: ['Enter', 'NumpadEnter'],
    hint: ['Comma'],
    shuffle: ['Period'],
  },
];

const CLEAR_MS = 240;
const TRACE_MS = 620;

function readSavedSetup(): Partial<DuelSetup> & { onlineName?: string } {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveSetup(setup: DuelSetup, onlineName?: string) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...setup, onlineName }));
  } catch {
    // LocalStorage might be disabled in private mode
  }
}

function getInitialMode(): DuelMode {
  if (typeof window === 'undefined') return 'local';
  const params = new URLSearchParams(window.location.search);
  if (params.get('room')) return 'online';
  const saved = readSavedSetup();
  const modeParam = params.get('mode') as DuelMode | null;
  return modeParam ?? saved.mode ?? 'local';
}

function getInitialSetup(): { setup: DuelSetup; seed: number } | null {
  if (typeof window === 'undefined') return null;
  const saved = readSavedSetup();
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode') as DuelMode | null;
  const diffParam = (params.get('difficulty') ?? params.get('board')) as string | null;
  const clockParam = params.get('clock');
  const autoParam = params.get('auto') === '1';
  const seedParam = params.get('seed');
  const p1Param = params.get('p1');
  const p2Param = params.get('p2');

  if (!autoParam && !seedParam) return null;

  const effectiveMode: DuelMode = modeParam ?? saved.mode ?? 'local';
  const difficulty = diffParam
    ? (normalizeDifficulty(diffParam) as Difficulty)
    : (saved.difficulty ?? 'normal');
  const clock = clockParam !== null ? Number(clockParam) : (saved.clock ?? 300);
  const parsedSeed = seedParam ? parseInt(seedParam, 36) : randomSeed();
  const seed = Number.isSafeInteger(parsedSeed) && parsedSeed > 0 ? parsedSeed : randomSeed();
  const names: [string, string] = [
    p1Param ?? saved.names?.[0] ?? (effectiveMode === 'solo' ? 'Player' : 'Player One'),
    p2Param ?? saved.names?.[1] ?? 'Player Two',
  ];

  return {
    setup: {
      mode: effectiveMode,
      names,
      difficulty,
      clock,
      rules: params.get('rules') === 'rush' ? 'rush' : saved.rules ?? 'classic',
    },
    seed,
  };
}

function buildPlayerState(
  index: number,
  setup: DuelSetup,
  seed: number,
  isRemote = false,
  remoteName = '',
): PlayerState {
  const preset = PRESETS[setup.difficulty] ?? PRESETS.normal;
  const totalPairs = (preset.rows * preset.cols) / 2;
  const label = isRemote
    ? remoteName
    : setup.names[index] || (setup.mode === 'solo' ? 'Player' : `Player ${index === 0 ? 'One' : 'Two'}`);

  const session: PlayerSession = isRemote
    ? ({
        label,
        rush: setup.rules === 'rush',
        seed,
        board: {
          rows: preset.rows,
          cols: preset.cols,
          cells: new Uint8Array(),
          remaining: totalPairs * 2,
        },
        status: 'playing',
        selected: null,
        hint: null,
        score: 0,
        matchedPairs: 0,
        streak: 0,
        bestStreak: 0,
        mistakes: 0,
        hintsLeft: 0,
        shufflesLeft: 0,
        reshuffles: 0,
      } as PlayerSession)
    : (createSession({
        rows: preset.rows,
        cols: preset.cols,
        iconCount: preset.iconCount,
        seed,
        hints: preset.hints,
        shuffles: preset.shuffles,
        label,
        rush: setup.rules === 'rush',
      }) as unknown as PlayerSession);

  return {
    index,
    label,
    session,
    totalPairs,
    cursor: null,
    clearingTiles: [],
    shakingTiles: [],
    traces: [],
    floaters: [],
    veil: null,
    remote: isRemote,
    remoteState: isRemote ? 'Playing…' : undefined,
  };
}

export function useDuel() {
  const [activeTabMode, setActiveTabMode] = useState<DuelMode>(() => getInitialMode());
  const [duel, setDuel] = useState<ActiveDuel | null>(() => {
    const initial = getInitialSetup();
    if (!initial) return null;
    const { setup, seed } = initial;
    return {
      mode: setup.mode,
      seed,
      setup,
      limit: setup.clock,
      elapsed: 0,
      level: 1,
      over: false,
      winner: -1,
      reason: null,
    };
  });

  const [players, setPlayers] = useState<PlayerState[]>(() => {
    const initial = getInitialSetup();
    if (!initial) return [];
    const { setup, seed } = initial;
    return setup.mode === 'solo'
      ? [buildPlayerState(0, setup, seed)]
      : [0, 1].map((i) => buildPlayerState(i, setup, seed));
  });

  const [timeLeft, setTimeLeft] = useState(() => {
    const initial = getInitialSetup();
    return initial ? initial.setup.clock : 300;
  });
  const [isUrgent, setIsUrgent] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(isMuted());

  // Overlays state
  const [isStartOpen, setIsStartOpen] = useState(() => getInitialSetup() === null);
  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);

  // Online multiplayer state
  const [online, setOnline] = useState<OnlineState>(() => {
    const saved = readSavedSetup();
    const roomParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('room') : null;
    const code = roomParam ? roomParam.toUpperCase() : '';
    return {
      code,
      name: saved.onlineName ?? '',
      you: null,
      hostId: null,
      foeId: null,
      players: [],
      settings: { difficulty: 'normal', clock: 300 },
      status: 'lobby',
      link: code ? inviteLink(code) : '',
      note: '',
    };
  });

  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relayRef = useRef<RelayInstance | null>(null);

  useEffect(() => {
    return () => {
      relayRef.current?.close();
      relayRef.current = null;
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const toggleSound = useCallback(() => {
    const next = !isMuted();
    setMuted(next);
    setSoundMuted(next);
    if (!next) sfx.pick();
  }, []);

  const finishDuel = useCallback(
    (reason: 'cleared' | 'time' | 'disconnect', winner = -1) => {
      setDuel((prev) => {
        if (!prev || prev.over) return prev;
        return { ...prev, over: true, winner, reason };
      });

      setPlayers((prevPlayers) => {
        return prevPlayers.map((player) => {
          if (player.session.status === 'playing') timeOut(player.session);
          const isSolo = duel?.mode === 'solo';
          const won = isSolo ? reason === 'cleared' : player.index === winner;
          const veil = isSolo
            ? {
                headline: won ? 'Stage Cleared!' : "Time's Up!",
                detail: won
                  ? `Finished in ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`
                  : `${player.session.matchedPairs} pairs`,
              }
            : {
                headline: winner === -1 ? 'Draw' : won ? 'Winner' : 'Beaten',
                detail:
                  won && reason === 'cleared' ? 'Board cleared' : `${player.session.matchedPairs} pairs`,
              };

          return {
            ...player,
            veil,
            session: {
              ...player.session,
              status: won ? 'won' : 'lost',
            },
          };
        });
      });

      setIsResultOpen(true);

      const isSolo = duel?.mode === 'solo';
      if (isSolo ? reason === 'cleared' : winner !== -1) {
        sfx.win();
      } else {
        sfx.reject();
      }
    },
    [duel?.mode, timeLeft],
  );

  const startDuel = useCallback(
    (setup: DuelSetup, seed = randomSeed()) => {
      relayRef.current?.close();
      relayRef.current = null;

      const mode = setup.mode ?? 'local';
      const level = setup.level ?? 1;
      const initialClock = setup.clock > 0 ? setup.clock : 0;

      const newDuel: ActiveDuel = {
        mode,
        seed,
        setup,
        limit: setup.clock,
        elapsed: 0,
        level,
        over: false,
        winner: -1,
        reason: null,
      };

      const newPlayers =
        mode === 'solo'
          ? [buildPlayerState(0, setup, seed)]
          : [0, 1].map((i) => buildPlayerState(i, setup, seed));

      setDuel(newDuel);
      setPlayers(newPlayers);
      setTimeLeft(initialClock);
      setIsUrgent(false);
      setIsStartOpen(false);
      setIsLobbyOpen(false);
      setIsResultOpen(false);

      saveSetup(setup);

      const diffInfo = PRESETS[setup.difficulty] ?? PRESETS.normal;
      const diffName = diffInfo.difficultyLabel ?? 'Medium';
      if (mode === 'solo') {
        showToast(
          `Level ${level} · ${diffName} (${diffInfo.label}) solo — clear the board before time runs out!`,
        );
      } else {
        showToast(
          `Level ${level} · ${diffName} (${diffInfo.label}) duel — same board for both players`,
        );
      }
    },
    [showToast],
  );

  // Clock tick timer
  useEffect(() => {
    if (!duel || duel.over) return;

    const timer = setInterval(() => {
      setDuel((prev) => {
        if (!prev || prev.over) return prev;
        const newElapsed = prev.elapsed + 1;

        if (prev.limit > 0) {
          const left = prev.limit - newElapsed;
          setTimeLeft(Math.max(0, left));
          setIsUrgent(left <= 30);
          if (left <= 5 && left > 0) sfx.tick();

          if (left <= 0) {
            clearInterval(timer);
            if (prev.mode === 'online') {
              relayRef.current?.flush();
              relayRef.current?.send({
                t: 'finish',
                reason: 'time',
                score: playersRef.current[0]?.session.score ?? 0,
                pairs: playersRef.current[0]?.session.matchedPairs ?? 0,
                elapsed: newElapsed,
              });
            } else if (prev.mode === 'solo') {
              setTimeout(() => finishDuel('time', -1), 0);
            } else {
              setPlayers((curPlayers) => {
                const [a, b] = curPlayers;
                let winner = -1;
                if (a && b) {
                  if (a.session.matchedPairs !== b.session.matchedPairs) {
                    winner = a.session.matchedPairs > b.session.matchedPairs ? 0 : 1;
                  } else if (a.session.score !== b.session.score) {
                    winner = a.session.score > b.session.score ? 0 : 1;
                  }
                }
                setTimeout(() => finishDuel('time', winner), 0);
                return curPlayers;
              });
            }
          }
        } else {
          setTimeLeft(newElapsed);
        }

        return { ...prev, elapsed: newElapsed };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [duel, finishDuel]);

  // Keep idle combo expiration visible without tying it to the match clock.
  const rushActive = Boolean(duel && !duel.over && duel.setup.rules === 'rush');
  useEffect(() => {
    if (!rushActive) return;
    const timer = window.setInterval(() => {
      setPlayers((current) => current.map((player) => {
        if (player.remote || !player.session.comboExpiresAt) return player;
        const session = { ...player.session };
        expireCombo(session);
        return { ...player, session, comboRemainingMs: Math.max(0, (session.comboExpiresAt ?? 0) - Date.now()) };
      }));
    }, 100);
    return () => window.clearInterval(timer);
  }, [rushActive]);

  // Handle tile pick
  const handlePick = useCallback(
    (playerIndex: number, r: number, c: number) => {
      if (!duel || duel.over) return;

      setPlayers((prevPlayers) => {
        const player = prevPlayers[playerIndex];
        if (!player || player.session.status !== 'playing' || player.remote) return prevPlayers;

        const result = select(player.session, r, c);
        const nextPlayers = [...prevPlayers];

        switch (result.type) {
          case 'select':
          case 'deselect':
            sfx.pick();
            nextPlayers[playerIndex] = {
              ...player,
              cursor: { r, c },
              session: { ...player.session },
            };
            break;

          case 'match': {
            sfx.match(player.session.streak);

            const path = result.path ?? [];
            const unitX = (col: number) =>
              col === 0 ? 0.25 : col <= player.session.board.cols ? col : player.session.board.cols + 0.75;
            const unitY = (row: number) =>
              row === 0 ? 0.25 : row <= player.session.board.rows ? row : player.session.board.rows + 0.75;

            const d = path.map((p: Point, i: number) => `${i === 0 ? 'M' : 'L'} ${unitX(p.c)} ${unitY(p.r)}`).join(' ');
            const traceId = `t-${Date.now()}-${Math.random()}`;
            const floaterId = `f-${Date.now()}-${Math.random()}`;

            const clearedKeys = (result.cleared ?? []).map((p: Point) => `${p.r},${p.c}`);
            const mid = result.cleared?.[0] ?? { r, c };

            nextPlayers[playerIndex] = {
              ...player,
              cursor: { r, c },
              clearingTiles: [...player.clearingTiles, ...clearedKeys],
              traces: [...player.traces, { id: traceId, d }],
              floaters: [...player.floaters, { id: floaterId, point: mid, text: `+${result.gained}` }],
              comboRemainingMs: player.session.rush ? 5000 : 0,
              session: {
                ...player.session,
                board: {
                  ...player.session.board,
                  cells: new Uint8Array(player.session.board.cells),
                },
              },
            };

            // Remove clearing animation after CLEAR_MS
            setTimeout(() => {
              setPlayers((cur) => {
                const target = cur[playerIndex];
                if (!target) return cur;
                const filtered = target.clearingTiles.filter((k) => !clearedKeys.includes(k));
                const updated = [...cur];
                updated[playerIndex] = { ...target, clearingTiles: filtered };
                return updated;
              });
            }, CLEAR_MS);

            // Remove trace and floater after TRACE_MS
            setTimeout(() => {
              setPlayers((cur) => {
                const target = cur[playerIndex];
                if (!target) return cur;
                const updated = [...cur];
                updated[playerIndex] = {
                  ...target,
                  traces: target.traces.filter((t) => t.id !== traceId),
                  floaters: target.floaters.filter((f) => f.id !== floaterId),
                };
                return updated;
              });
            }, TRACE_MS);

            if (result.autoShuffled) {
              setTimeout(() => {
                sfx.shuffle();
                showToast(`${player.label}: no moves left — board reshuffled`);
              }, CLEAR_MS + 20);
            }

            if (result.won) {
              player.finishedAt = duel.elapsed;
              if (duel.mode === 'online') {
                relayRef.current?.flush();
                relayRef.current?.send({
                  t: 'finish',
                  reason: 'cleared',
                  score: player.session.score,
                  pairs: player.session.matchedPairs,
                  elapsed: duel.elapsed,
                });
              } else {
                setTimeout(() => finishDuel('cleared', playerIndex), CLEAR_MS + 40);
              }
            }

            if (duel.mode === 'online' && playerIndex === 0) {
              relayRef.current?.pushProgress({
                score: player.session.score,
                pairs: player.session.matchedPairs,
                streak: player.session.streak,
              });
            }
            break;
          }

          case 'mismatch':
          case 'blocked': {
            sfx.reject();
            const keys = (result.attempted ?? []).map((p: Point) => `${p.r},${p.c}`);
            nextPlayers[playerIndex] = {
              ...player,
              cursor: { r, c },
              shakingTiles: [...player.shakingTiles, ...keys],
              session: { ...player.session },
            };

            setTimeout(() => {
              setPlayers((cur) => {
                const target = cur[playerIndex];
                if (!target) return cur;
                const filtered = target.shakingTiles.filter((k) => !keys.includes(k));
                const updated = [...cur];
                updated[playerIndex] = { ...target, shakingTiles: filtered };
                return updated;
              });
            }, 300);
            break;
          }

          default:
            break;
        }

        return nextPlayers;
      });
    },
    [duel, finishDuel, showToast],
  );

  const triggerPlayerHint = useCallback((playerIndex: number) => {
    setPlayers((prev) => {
      const player = prev[playerIndex];
      if (!player || player.session.status !== 'playing') return prev;
      const move = requestHint(player.session);
      if (!move) return prev;
      const updated = [...prev];
      updated[playerIndex] = { ...player, session: { ...player.session } };
      return updated;
    });
  }, []);

  const triggerPlayerShuffle = useCallback((playerIndex: number) => {
    setPlayers((prev) => {
      const player = prev[playerIndex];
      if (!player || player.session.status !== 'playing') return prev;
      const success = requestShuffle(player.session);
      if (!success) return prev;
      sfx.shuffle();
      const updated = [...prev];
      updated[playerIndex] = {
        ...player,
        session: {
          ...player.session,
          board: {
            ...player.session.board,
            cells: new Uint8Array(player.session.board.cells),
          },
        },
      };
      return updated;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!duel || duel.over) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      )
        return;

      for (const map of KEYMAP) {
        const playerIndex = duel.mode === 'solo' ? 0 : map.player;
        const player = players[playerIndex];
        if (!player || player.session.status !== 'playing') continue;

        const moveCursorInDir = (dr: number, dc: number) => {
          event.preventDefault();
          const { board } = player.session;
          let cursor = player.cursor;
          if (!cursor) {
            for (let r = 1; r <= board.rows; r += 1) {
              for (let c = 1; c <= board.cols; c += 1) {
                if (!isEmpty(board, r, c)) {
                  cursor = { r, c };
                  break;
                }
              }
              if (cursor) break;
            }
          }
          if (!cursor) return;

          let { r, c } = cursor;
          for (let step = 0; step < Math.max(board.rows, board.cols) + 1; step += 1) {
            r += dr;
            c += dc;
            if (!inBounds(board, r, c)) break;
            if (!isEmpty(board, r, c)) {
              cursor = { r, c };
              break;
            }
          }

          setPlayers((cur) => {
            const next = [...cur];
            next[playerIndex] = { ...next[playerIndex], cursor };
            return next;
          });
        };

        if (map.up.includes(event.code)) {
          moveCursorInDir(-1, 0);
          return;
        }
        if (map.down.includes(event.code)) {
          moveCursorInDir(1, 0);
          return;
        }
        if (map.left.includes(event.code)) {
          moveCursorInDir(0, -1);
          return;
        }
        if (map.right.includes(event.code)) {
          moveCursorInDir(0, 1);
          return;
        }

        if (map.pick.includes(event.code)) {
          event.preventDefault();
          let cursor = player.cursor;
          if (!cursor) {
            for (let r = 1; r <= player.session.board.rows; r += 1) {
              for (let c = 1; c <= player.session.board.cols; c += 1) {
                if (!isEmpty(player.session.board, r, c)) {
                  cursor = { r, c };
                  break;
                }
              }
              if (cursor) break;
            }
          }
          if (cursor) handlePick(playerIndex, cursor.r, cursor.c);
          return;
        }

        if (map.hint.includes(event.code)) {
          event.preventDefault();
          triggerPlayerHint(playerIndex);
          return;
        }

        if (map.shuffle.includes(event.code)) {
          event.preventDefault();
          triggerPlayerShuffle(playerIndex);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duel, players, handlePick, triggerPlayerHint, triggerPlayerShuffle]);

  const advanceNextLevel = useCallback(() => {
    if (!duel) return;
    const next = calculateNextLevel(duel.setup.difficulty, duel.level, duel.setup.clock);
    const nextSetup: DuelSetup = {
      ...duel.setup,
      difficulty: next.difficulty as Difficulty,
      clock: next.clock,
      level: next.level,
    };
    startDuel(nextSetup, randomSeed());
  }, [duel, startDuel]);

  const startOnlineRound = useCallback(
    (seed: number, settings: { difficulty: string; clock: number; rules?: DuelRules }, roster: OnlinePeer[]) => {
      const normalizedDiff = (normalizeDifficulty(settings.difficulty) || 'normal') as Difficulty;
      const preset = PRESETS[normalizedDiff] ?? PRESETS.normal;
      const level = preset.level ?? 2;
      const clock = Number(settings.clock) || 0;

      const currentOnline = onlineRef.current;
      const mine = roster.find((p) => p.id === currentOnline.you);
      const theirs = roster.find((p) => p.id !== currentOnline.you);

      const setup: DuelSetup = {
        mode: 'online',
        names: [mine?.name ?? currentOnline.name ?? 'Player One', theirs?.name ?? 'Opponent'],
        difficulty: normalizedDiff,
        clock,
        level,
        rules: settings.rules ?? 'classic',
      };

      const myPlayer = buildPlayerState(0, setup, seed);

      const totalPairs = (preset.rows * preset.cols) / 2;
      const foeBoard = createBoard({
        rows: preset.rows,
        cols: preset.cols,
        iconCount: preset.iconCount,
        seed,
      });

      const foePlayer: PlayerState = {
        index: 1,
        label: setup.names[1],
        remote: true,
        remoteState: 'Playing…',
        totalPairs,
        session: {
          label: setup.names[1],
          seed,
          board: foeBoard,
          status: 'playing',
          selected: null,
          hint: null,
          score: 0,
          matchedPairs: 0,
          streak: 0,
          bestStreak: 0,
          mistakes: 0,
          hintsLeft: preset.hints,
          shufflesLeft: preset.shuffles,
          reshuffles: 0,
        },
        cursor: null,
        clearingTiles: [],
        shakingTiles: [],
        traces: [],
        floaters: [],
        veil: null,
      };

      setDuel({
        mode: 'online',
        seed,
        setup,
        limit: clock,
        elapsed: 0,
        level,
        over: false,
        winner: -1,
        reason: null,
      });

      setPlayers([myPlayer, foePlayer]);
      setTimeLeft(clock);
      setIsUrgent(false);
      setIsStartOpen(false);
      setIsLobbyOpen(false);
      setIsResultOpen(false);

      showToast(`Duel started! Playing against ${setup.names[1]}`);
    },
    [showToast],
  );

  const joinOnline = useCallback(
    (requestedCode: string, name: string) => {
      if (!isRelayConfigured()) {
        showToast('This copy of the game has no relay configured.');
        return;
      }

      const code = (requestedCode || newRoomCode()).toUpperCase();

      relayRef.current?.close();

      setOnline((prev) => ({
        ...prev,
        code,
        name,
        you: null,
        hostId: null,
        foeId: null,
        players: [{ id: 'local-init', name, host: true }],
        settings: { difficulty: 'normal', clock: 300 },
        status: 'lobby',
        linkState: 'connecting',
        link: inviteLink(code),
        note: 'Connecting to the relay…',
      }));

      setIsStartOpen(false);
      setIsLobbyOpen(true);
      setIsResultOpen(false);

      saveSetup({ mode: 'online', names: [name, 'Player Two'], difficulty: 'normal', clock: 300 }, name);

      const relay = (createRelay as unknown as (opts: {
        code: string;
        name: string;
        onStatus: (status: { state: string; code?: number }) => void;
        onMessage: (msg: RelayMessage) => void;
      }) => RelayInstance)({
        code,
        name,
        onStatus: (status: { state: string }) => {
          setOnline((prev) => ({
            ...prev,
            linkState: status.state,
            note:
              status.state === 'open'
                ? 'Connected to room. Waiting for players…'
                : status.state === 'connecting'
                ? 'Connecting to the relay…'
                : status.state === 'dropped'
                ? 'Connection lost — retrying…'
                : status.state === 'error'
                ? 'Connection error'
                : prev.note,
          }));
        },
        onMessage: (msg: RelayMessage) => {
          switch (msg.t) {
            case 'welcome':
              setOnline((prev) => {
                const isHost = msg.you === msg.hostId;
                const playersList = msg.players ?? [];
                const statusText =
                  playersList.length < 2
                    ? 'Send the room code or invite link to your opponent.'
                    : isHost
                    ? 'Both players connected! Choose settings and start.'
                    : 'Both players connected! Waiting for host to start.';
                return {
                  ...prev,
                  you: msg.you ?? null,
                  hostId: msg.hostId ?? null,
                  settings: msg.settings ?? prev.settings,
                  players: playersList,
                  status: msg.status ?? 'lobby',
                  note: statusText,
                };
              });
              break;

            case 'peers':
              setOnline((prev) => {
                const isHost = prev.you === msg.hostId;
                const playersList = msg.players ?? [];
                const statusText =
                  playersList.length < 2
                    ? 'Waiting for opponent to join…'
                    : isHost
                    ? 'Both players connected! Choose settings and start.'
                    : 'Both players connected! Waiting for host to start.';
                return {
                  ...prev,
                  hostId: msg.hostId ?? null,
                  players: playersList,
                  note: statusText,
                };
              });

              setPlayers((prevPlayers) => {
                if (prevPlayers.length < 2 || !prevPlayers[1].remote) return prevPlayers;
                const theirs = (msg.players ?? []).find((p) => p.id !== onlineRef.current.you);
                if (!theirs) return prevPlayers;
                return [
                  prevPlayers[0],
                  {
                    ...prevPlayers[1],
                    label: theirs.name,
                    session: { ...prevPlayers[1].session, label: theirs.name },
                  },
                ];
              });
              break;

            case 'settings':
              if (msg.settings) {
                setOnline((prev) => ({
                  ...prev,
                  settings: msg.settings!,
                }));
              }
              break;

            case 'start':
              if (msg.seed && msg.settings && msg.players) {
                startOnlineRound(msg.seed, msg.settings, msg.players);
              }
              break;

            case 'progress':
              setPlayers((prevPlayers) => {
                if (prevPlayers.length < 2 || !prevPlayers[1].remote) return prevPlayers;
                const foe = prevPlayers[1];
                const newScore = msg.score ?? foe.session.score;
                const newPairs = msg.pairs ?? foe.session.matchedPairs;
                const newStreak = msg.streak ?? foe.session.streak;
                return [
                  prevPlayers[0],
                  {
                    ...foe,
                    session: {
                      ...foe.session,
                      score: newScore,
                      matchedPairs: newPairs,
                      streak: newStreak,
                      bestStreak: Math.max(foe.session.bestStreak, newStreak),
                      board: {
                        ...foe.session.board,
                        remaining: Math.max(0, foe.totalPairs * 2 - newPairs * 2),
                      },
                    },
                  },
                ];
              });
              break;

            case 'result': {
              const winnerIdx =
                msg.winner === null || msg.winner === undefined
                  ? -1
                  : msg.winner === onlineRef.current.you
                  ? 0
                  : 1;
              finishDuel(msg.reason ?? 'cleared', winnerIdx);
              break;
            }

            case 'peer_left':
              showToast(`${msg.name ?? 'Opponent'} disconnected`);
              break;

            case 'error': {
              const errCode = msg.code ?? 'unknown';
              const errors: Record<string, string> = {
                room_full: 'That room already has two players.',
                not_host: 'Only the host can do that.',
                need_two: 'Waiting for a second player to join.',
                in_progress: 'The duel is already running.',
                bad_code: 'Room code must be 4–12 letters or digits.',
                too_fast: 'Disconnected for sending too fast.',
              };
              showToast(errors[errCode] ?? `Relay error: ${errCode}`);
              break;
            }
          }
        },
      });

      relayRef.current = relay;
    },
    [finishDuel, showToast, startOnlineRound],
  );

  const changeOnlineDifficulty = useCallback((difficulty: Difficulty) => {
    setOnline((prev) => {
      const nextSettings = { ...prev.settings, difficulty };
      relayRef.current?.send({ t: 'settings', settings: nextSettings });
      return { ...prev, settings: nextSettings };
    });
  }, []);

  const changeOnlineClock = useCallback((clock: number) => {
    setOnline((prev) => {
      const nextSettings = { ...prev.settings, clock };
      relayRef.current?.send({ t: 'settings', settings: nextSettings });
      return { ...prev, settings: nextSettings };
    });
  }, []);

  const changeOnlineRules = useCallback((rules: DuelRules) => {
    setOnline((prev) => {
      relayRef.current?.send({ t: 'settings', settings: { ...prev.settings, rules } });
      return { ...prev, settings: { ...prev.settings, rules } };
    });
  }, []);

  const startOnlineDuel = useCallback(() => {
    relayRef.current?.send({ t: 'start' });
  }, []);

  const leaveOnlineRoom = useCallback(() => {
    relayRef.current?.close();
    relayRef.current = null;
    setIsLobbyOpen(false);
    setIsResultOpen(false);
    setIsStartOpen(true);
    showToast('Left online room');
  }, [showToast]);

  const copyOnlineInvite = useCallback(() => {
    const link = onlineRef.current.link || inviteLink(onlineRef.current.code);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link);
      showToast('Invite link copied to clipboard!');
    }
  }, [showToast]);

  const requestRematch = useCallback(
    (sameSeed = true) => {
      if (!duel) return;
      if (duel.mode === 'online') {
        const isHost = onlineRef.current.you === onlineRef.current.hostId;
        if (!isHost) {
          showToast('Only the room host can start a rematch.');
          return;
        }
        relayRef.current?.send({ t: 'rematch', sameSeed });
        return;
      }
      startDuel(duel.setup, sameSeed ? duel.seed : randomSeed());
    },
    [duel, showToast, startDuel],
  );

  const openNewDuel = useCallback(() => {
    relayRef.current?.close();
    relayRef.current = null;
    setIsResultOpen(false);
    setIsLobbyOpen(false);
    setIsStartOpen(true);
  }, []);

  return {
    activeTabMode,
    setActiveTabMode,
    duel,
    players,
    timeLeft,
    isUrgent,
    toastMessage,
    soundMuted,
    toggleSound,
    isStartOpen,
    isLobbyOpen,
    isResultOpen,
    online,
    startDuel,
    handlePick,
    triggerPlayerHint,
    triggerPlayerShuffle,
    advanceNextLevel,
    requestRematch,
    openNewDuel,
    joinOnline,
    changeOnlineDifficulty,
    changeOnlineClock,
    changeOnlineRules,
    startOnlineDuel,
    leaveOnlineRoom,
    copyOnlineInvite,
  };
}
