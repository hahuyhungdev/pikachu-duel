/**
 * The solo run controller.
 *
 * Everything that makes a run feel like a run lives here: which stage is live,
 * how many lives are left, what the clock is doing, and what happens the moment
 * a board is emptied or a clock hits zero. The views below it are dumb — they
 * render the `hud`, `board` and `summary` objects this hook derives and call
 * back into the handful of actions it exposes.
 *
 * The rules themselves are not here. Board shapes come from `stages.js`, mode
 * behaviour from `modes.js`, and scoring from `session.js`, so a balance change
 * never means touching React.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FIRST_STAGE, INTRODUCES } from '../../../game/stages.js';
import { randomSeed } from '../../../game/rng.js';
import {
  COMBO_TIERS,
  GRAVITY_LABELS,
  MODES,
  MODE_IDS,
  buildRound,
  createSession,
  describeStage,
  expire,
  listMarks,
  modeRules,
  pickTile,
  stageObjective,
  stageStars,
  takeHint,
  takeShuffle,
  type PickResult,
  type SoloSession,
} from '../gameApi';
import { isMuted, setMuted, sfx } from '../../../shared/audio/sfx';
import { loadProfile, recordRun, type Profile } from '../../../shared/game/profile';
import type {
  Difficulty,
  GameMode,
  ModeCard,
  Point,
  ProfileSummary,
  Round,
  RunPhase,
  RunSummary,
  SoloBoardView,
  SoloHud,
  TileSlide,
} from '../types/solo.types';

/** How long the clear flash and the gravity slide stay on a tile. */
const CLEAR_MS = 240;
const TRACE_MS = 620;
const SLIDE_MS = 260;

const URGENT_AT = 30;
const CRITICAL_AT = 10;

const SETTINGS_KEY = 'pikachu-duel/solo';

interface SavedSettings {
  mode?: GameMode;
  difficulty?: Difficulty;
}

function readSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as SavedSettings) : {};
  } catch {
    return {};
  }
}

function writeSettings(settings: SavedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* a player in private mode still gets to play, just without a memory */
  }
}

const key = (point: Point) => `${point.r},${point.c}`;

/** Turn a connecting path into the SVG the board draws over the tiles. */
function tracePath(path: Point[]): string {
  return path
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.c - 0.5 + 0.5} ${p.r - 0.5 + 0.5}`)
    .join(' ');
}

/** How far along the current combo tier the streak has climbed, 0..1. */
function comboProgress(streak: number, tier: number): number {
  const floor = COMBO_TIERS[tier] ?? 0;
  const ceiling = COMBO_TIERS[tier + 1];
  if (ceiling === undefined) return 1;
  return Math.max(0, Math.min(1, (streak - floor) / (ceiling - floor)));
}

/** The twists this exact stage introduces, so the intro card can flag them. */
function freshTwists(stage: number): string[] {
  const fresh: string[] = [];
  if (stage === INTRODUCES.gold) fresh.push('Gold tiles — a pair worth triple score');
  if (stage === INTRODUCES.ice) fresh.push('Iced tiles — match them twice to clear them');
  if (stage === INTRODUCES.bomb) fresh.push('Bombs — they count down every match and cost you 15 seconds');
  if (stage === INTRODUCES.gravity) fresh.push('Gravity — the board collapses into every gap you make');
  return fresh;
}

export function useSolo() {
  const saved = readSettings();

  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [mode, setMode] = useState<GameMode>(saved.mode ?? 'adventure');
  const [difficulty, setDifficulty] = useState<Difficulty>(saved.difficulty ?? 'normal');

  const [phase, setPhase] = useState<RunPhase>('menu');
  const [introOpen, setIntroOpen] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [session, setSession] = useState<SoloSession | null>(null);

  const [heartsLeft, setHeartsLeft] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [runPairs, setRunPairs] = useState(0);
  const [runBestStreak, setRunBestStreak] = useState(0);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  const [clearingTiles, setClearingTiles] = useState<string[]>([]);
  const [shakingTiles, setShakingTiles] = useState<string[]>([]);
  const [crackingTiles, setCrackingTiles] = useState<string[]>([]);
  const [slides, setSlides] = useState<TileSlide[]>([]);
  const [traces, setTraces] = useState<Array<{ id: string; d: string }>>([]);
  const [floaters, setFloaters] = useState<Array<{ id: string; point: Point; text: string }>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(() => isMuted());

  const timers = useRef<number[]>([]);
  const toastTimer = useRef<number | undefined>(undefined);

  /** Every deferred visual reset funnels through here so nothing fires after a reset. */
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    writeSettings({ mode, difficulty });
  }, [mode, difficulty]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const rules = useMemo(() => modeRules(mode), [mode]);

  /** Deal one stage and put it on screen. */
  const dealStage = useCallback(
    (nextMode: GameMode, stage: number, options: { keepClock?: number } = {}) => {
      clearTimers();
      const seed = randomSeed();
      const next = buildRound({ mode: nextMode, stage, difficulty, seed }) as Round;

      const dealt = createSession({
        rows: next.rows,
        cols: next.cols,
        iconCount: next.iconCount,
        seed: next.seed,
        hints: next.hints,
        shuffles: next.shuffles,
        gravity: next.gravity,
        gold: next.gold,
        ice: next.ice,
        bomb: next.bomb,
        bombFuse: next.bombFuse,
        timeGain: next.timeGain,
        label: next.label,
      });

      setRound(next);
      setSession(dealt);
      setTimeLeft(options.keepClock ?? next.clock);
      setClearingTiles([]);
      setShakingTiles([]);
      setCrackingTiles([]);
      setSlides([]);
      setTraces([]);
      setFloaters([]);
      setPhase('playing');

      // Adventure explains each new stage before it starts; Time Attack must
      // never break its own flow, and the other modes only have one board.
      setIntroOpen(nextMode === 'adventure');
      return next;
    },
    [clearTimers, difficulty],
  );

  const startRun = useCallback(() => {
    const startRules = modeRules(mode);
    setHeartsLeft(startRules.hearts);
    setRunScore(0);
    setRunPairs(0);
    setRunBestStreak(0);
    setSummary(null);
    dealStage(mode, FIRST_STAGE);
  }, [dealStage, mode]);

  /**
   * Fold a finished stage into the run and, when the run itself is finished,
   * write it to the profile. Returns nothing — it drives phase instead.
   */
  const endStage = useCallback(
    (outcome: 'cleared' | 'failed') => {
      if (!round || !session) return;

      const stageScore = session.score;
      const totalScore = runScore + stageScore;
      const totalPairs = runPairs + session.matchedPairs;
      const bestStreak = Math.max(runBestStreak, session.bestStreak);
      const cleared = outcome === 'cleared';
      const stars = rules.ladder ? stageStars(round.stage, { cleared, score: stageScore }) : 0;

      setRunScore(totalScore);
      setRunPairs(totalPairs);
      setRunBestStreak(bestStreak);

      const livesAfter = cleared ? heartsLeft : Math.max(0, heartsLeft - 1);
      if (!cleared) setHeartsLeft(livesAfter);

      // Time Attack rolls straight into the next stage while the clock still
      // has seconds on it — stopping to read a panel is what kills the mode.
      if (cleared && round.mode === 'timeattack') {
        showToast(`Stage ${round.stage} cleared · +${stageScore.toLocaleString('en-US')}`);
        dealStage(round.mode, round.stage + 1, { keepClock: timeLeft });
        return;
      }

      const runContinues = cleared ? rules.ladder && round.mode === 'adventure' : livesAfter > 0;

      const outcomeRecord = runContinues
        ? null
        : recordRun({
            mode: round.mode,
            score: totalScore,
            stage: round.stage,
            bestStreak,
            pairs: totalPairs,
            stars,
          });

      if (outcomeRecord) setProfile(outcomeRecord.profile);

      setSummary({
        mode: round.mode,
        modeLabel: round.label,
        stage: round.stage,
        stars,
        runScore: totalScore,
        stageScore,
        pairs: totalPairs,
        bestStreak,
        heartsLeft: livesAfter,
        records: outcomeRecord?.records ?? { score: false, stage: false, streak: false },
        previousBest: outcomeRecord?.previousBest ?? { score: 0, stage: 0, streak: 0 },
        newUnlocks: outcomeRecord?.newUnlocks ?? [],
      });

      setPhase(runContinues ? (cleared ? 'cleared' : 'failed') : 'over');
      if (cleared) sfx.win();
    },
    [dealStage, heartsLeft, round, rules.ladder, runBestStreak, runPairs, runScore, session, showToast, timeLeft],
  );

  /** The clock. Zen has none, and it never runs behind a panel. */
  useEffect(() => {
    if (phase !== 'playing' || introOpen || !round?.timed) return undefined;

    const id = window.setInterval(() => {
      setTimeLeft((left) => {
        const next = left - 1;
        if (next <= CRITICAL_AT && next > 0) sfx.tick();
        return next > 0 ? next : 0;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [introOpen, phase, round?.timed]);

  useEffect(() => {
    if (phase !== 'playing' || introOpen || !round?.timed || timeLeft > 0 || !session) return undefined;
    expire(session);
    // Deferred by a tick so the stage teardown is its own render, not a
    // cascading setState inside this effect's body.
    const id = window.setTimeout(() => endStage('failed'), 0);
    return () => window.clearTimeout(id);
  }, [endStage, introOpen, phase, round?.timed, session, timeLeft]);

  const pick = useCallback(
    (r: number, c: number) => {
      if (phase !== 'playing' || introOpen || !session) return;

      const result: PickResult = pickTile(session, r, c);
      setSession((current) => (current ? { ...current } : current));

      if (result.type === 'select') {
        sfx.pick();
        return;
      }
      if (result.type === 'deselect' || result.type === 'invalid') return;

      if (result.type === 'mismatch' || result.type === 'blocked') {
        sfx.reject();
        const shaken = (result.attempted ?? []).map(key);
        setShakingTiles(shaken);
        later(() => setShakingTiles([]), CLEAR_MS);
        return;
      }

      // A match or a crack: both are good play and both feed the combo.
      sfx.match(session.streak);

      const cleared = result.cleared ?? [];
      const cracked = result.cracked ?? [];
      const exploded = result.exploded ?? [];
      const moves = result.moves ?? [];
      const gained = result.gained ?? 0;
      const multiplier = result.multiplier ?? 1;
      const timeDelta = result.timeDelta ?? 0;

      const traceId = `t${Date.now()}${r}${c}`;
      setTraces((list) => [...list, { id: traceId, d: tracePath(result.path ?? []) }]);
      later(() => setTraces((list) => list.filter((t) => t.id !== traceId)), TRACE_MS);

      const floatId = `f${Date.now()}${r}${c}`;
      const text = multiplier > 1 ? `+${gained} ×${multiplier}` : `+${gained}`;
      setFloaters((list) => [...list, { id: floatId, point: { r, c }, text }]);
      later(() => setFloaters((list) => list.filter((f) => f.id !== floatId)), TRACE_MS);

      if (cracked.length > 0) {
        setCrackingTiles(cracked.map(key));
        later(() => setCrackingTiles([]), CLEAR_MS);
      }

      if (cleared.length > 0) {
        setClearingTiles(cleared.map(key));
        later(() => setClearingTiles([]), CLEAR_MS);
      }

      if (moves.length > 0) {
        setSlides(
          moves.map((move) => ({
            key: key(move.to),
            dr: move.from.r - move.to.r,
            dc: move.from.c - move.to.c,
          })),
        );
        later(() => setSlides([]), SLIDE_MS);
      }

      if (timeDelta !== 0) {
        setTimeLeft((left) => Math.max(0, left + timeDelta));
      }
      if (exploded.length > 0) {
        showToast(`Bomb went off — ${exploded.length * 15}s gone`);
        sfx.reject();
      }
      if (result.autoShuffled) showToast('No moves left — board reshuffled');

      if (result.won) later(() => endStage('cleared'), CLEAR_MS + 40);
    },
    [endStage, introOpen, later, phase, session, showToast],
  );

  const hint = useCallback(() => {
    if (phase !== 'playing' || introOpen || !session) return;
    const move = takeHint(session);
    setSession((current) => (current ? { ...current } : current));
    if (!move) showToast('No hints left');
  }, [introOpen, phase, session, showToast]);

  const shuffle = useCallback(() => {
    if (phase !== 'playing' || introOpen || !session) return;
    const ok = takeShuffle(session);
    setSession((current) => (current ? { ...current } : current));
    if (ok) sfx.shuffle();
    else showToast('No shuffles left');
  }, [introOpen, phase, session, showToast]);

  /** The single button the result screen leads with: next stage, or try again. */
  const continueRun = useCallback(() => {
    if (!round) return;
    setSummary(null);
    if (phase === 'cleared') dealStage(round.mode, round.stage + 1);
    else dealStage(round.mode, round.stage);
  }, [dealStage, phase, round]);

  const retryRun = useCallback(() => {
    setSummary(null);
    startRun();
  }, [startRun]);

  const changeMode = useCallback(() => {
    clearTimers();
    setSummary(null);
    setSession(null);
    setRound(null);
    setIntroOpen(false);
    setPhase('menu');
  }, [clearTimers]);

  const beginStage = useCallback(() => setIntroOpen(false), []);

  const toggleSound = useCallback(() => setSoundMuted(setMuted(!isMuted())), []);

  const selectMode = useCallback((next: GameMode) => setMode(next), []);

  const modeCards = useMemo<ModeCard[]>(
    () =>
      MODE_IDS.map((id) => {
        const record = profile.modes[id];
        const tracksStage = MODES[id].tracksBest === 'stage';
        const value = tracksStage ? record.bestStage : record.bestScore;
        return {
          id,
          label: MODES[id].label,
          blurb: MODES[id].blurb,
          bestLabel: tracksStage ? 'Best stage' : 'Best score',
          bestValue: value > 0 ? value.toLocaleString('en-US') : '',
          spent: id === 'daily' && profile.daily?.day === buildRound({ mode: 'daily' }).day,
        };
      }),
    [profile],
  );

  const profileSummary = useMemo<ProfileSummary>(
    () => ({
      dayStreak: profile.dayStreak,
      totalPairs: profile.totalPairs,
      totalPlays: profile.totalPlays,
      unlocked: profile.unlocks.length,
      unlockTotal: 8,
    }),
    [profile],
  );

  const hud = useMemo<SoloHud | null>(() => {
    if (!round || !session) return null;
    const tier = session.tier;
    return {
      mode: round.mode,
      modeLabel: round.label,
      stage: round.stage,
      stageNote: rules.ladder
        ? describeStage(round.stage)
        : `${round.rows}×${round.cols}${round.gravity !== 'none' ? ` · ${GRAVITY_LABELS[round.gravity] ?? ''}` : ''}`,
      objective: rules.ladder ? stageObjective(round.stage).text : null,
      timed: round.timed,
      timeLeft,
      isUrgent: round.timed && timeLeft <= URGENT_AT,
      isCritical: round.timed && timeLeft <= CRITICAL_AT,
      hearts: round.hearts,
      heartsLeft,
      score: session.score,
      runScore: runScore + session.score,
      streak: session.streak,
      tier,
      fever: session.fever,
      comboProgress: comboProgress(session.streak, tier),
      hintsLeft: session.hintsLeft,
      shufflesLeft: session.shufflesLeft,
      pairsLeft: session.board.remaining / 2,
      totalPairs: round.pairs,
      bestScore: profile.modes[round.mode].bestScore,
    };
  }, [heartsLeft, profile, round, rules.ladder, runScore, session, timeLeft]);

  const board = useMemo<SoloBoardView | null>(() => {
    if (!session) return null;
    return {
      session,
      marks: listMarks(session.board),
      slides,
      clearingTiles,
      shakingTiles,
      crackingTiles,
      traces,
      floaters,
    };
  }, [clearingTiles, crackingTiles, floaters, session, shakingTiles, slides, traces]);

  const continueLabel = useMemo(() => {
    if (phase === 'cleared') return `Next stage ${(round?.stage ?? 0) + 1} →`;
    const lives = Math.max(0, heartsLeft);
    return `Try stage ${round?.stage ?? 1} again · ${lives} ${lives === 1 ? 'life' : 'lives'} left`;
  }, [heartsLeft, phase, round]);

  return {
    phase,
    introOpen,
    mode,
    difficulty,
    round,
    hud,
    board,
    summary,
    toast,
    soundMuted,
    modeCards,
    profileSummary,
    showDifficulty: !modeRules(mode).ladder,
    canContinue: phase === 'cleared' || phase === 'failed',
    continueLabel,
    stageIntro: round
      ? { stage: round.stage, note: describeStage(round.stage), objective: stageObjective(round.stage).text, fresh: freshTwists(round.stage) }
      : null,
    selectMode,
    setDifficulty,
    startRun,
    beginStage,
    pick,
    hint,
    shuffle,
    continueRun,
    retryRun,
    changeMode,
    toggleSound,
  };
}
