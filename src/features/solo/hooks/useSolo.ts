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
import { loadProfile, saveProfile, recordRun, type Profile } from '../../../shared/game/profile';
import { submitScore } from '../../leaderboard';
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
  if (stage === INTRODUCES.chrono) fresh.push('Chrono tiles — +8s time surge and 5-second clock freeze');
  if (stage === INTRODUCES.ice) fresh.push('Iced tiles — match them twice to clear them');
  if (stage === INTRODUCES.bomb) fresh.push('Bombs — they count down every match and cost you 15 seconds');
  if (stage === INTRODUCES.gravity) fresh.push('Gravity — the board collapses into every gap you make');
  return fresh;
}

export function useSolo(userId?: string | null, accountProfile?: Profile) {
  const saved = readSettings();

  const [localProfile, setProfile] = useState<Profile>(() => loadProfile(userId));
  const profile = accountProfile ?? localProfile;
  const isPortraitMode = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 680 && window.innerHeight > window.innerWidth;
  }, []);

  const [mode, setMode] = useState<GameMode>(saved.mode ?? 'adventure');
  const [difficulty, setDifficulty] = useState<Difficulty>(() => {
    if (saved.difficulty) return saved.difficulty;
    if (typeof window !== 'undefined' && window.innerWidth <= 680) return 'easy';
    return 'normal';
  });

  const [phase, setPhase] = useState<RunPhase>('menu');
  const [introOpen, setIntroOpen] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [session, setSession] = useState<SoloSession | null>(null);

  const [heartsLeft, setHeartsLeft] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [freezeLeft, setFreezeLeft] = useState(0);
  const [overtimeLeft, setOvertimeLeft] = useState(0);
  const [overtimeUsed, setOvertimeUsed] = useState(false);
  const [bonusAids, setBonusAids] = useState<{ hints: number; shuffles: number }>({ hints: 0, shuffles: 0 });
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
  const freezeLeftRef = useRef(0);
  const overtimeLeftRef = useRef(0);
  const overtimeUsedRef = useRef(false);
  const timeLeftRef = useRef(0);

  useEffect(() => {
    freezeLeftRef.current = freezeLeft;
  }, [freezeLeft]);
  useEffect(() => {
    overtimeLeftRef.current = overtimeLeft;
  }, [overtimeLeft]);
  useEffect(() => {
    overtimeUsedRef.current = overtimeUsed;
  }, [overtimeUsed]);
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

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
      const portrait = isPortraitMode();
      const next = buildRound({ mode: nextMode, stage, difficulty, seed, portrait }) as Round;

      // Consume earned bonus aids for this stage so aids don't snowball infinitely
      const extraHints = bonusAids.hints;
      const extraShuffles = bonusAids.shuffles;
      if (extraHints > 0 || extraShuffles > 0) {
        setBonusAids({ hints: 0, shuffles: 0 });
      }

      const dealt = createSession({
        rows: next.rows,
        cols: next.cols,
        iconCount: next.iconCount,
        iconPool: next.iconPool,
        seed: next.seed,
        hints: next.hints + extraHints,
        shuffles: next.shuffles + extraShuffles,
        gravity: next.gravity,
        gold: next.gold,
        chrono: next.chrono,
        ice: next.ice,
        bomb: next.bomb,
        bombFuse: next.bombFuse,
        timeGain: next.timeGain,
        label: next.label,
      });

      freezeLeftRef.current = 0;
      setFreezeLeft(0);
      overtimeLeftRef.current = 0;
      setOvertimeLeft(0);
      overtimeUsedRef.current = false;
      setOvertimeUsed(false);

      const nextClock = options.keepClock ?? next.clock;
      timeLeftRef.current = nextClock;
      setTimeLeft(nextClock);

      setRound(next);
      setSession(dealt);
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
      if (nextMode === 'adventure') {
        const checkpoint = loadProfile(userId);
        if (stage > (checkpoint.modes.adventure.bestStage ?? 0)) {
          checkpoint.modes.adventure.bestStage = stage;
          saveProfile(checkpoint, userId);
          setProfile(checkpoint);
        }
      }
      return next;
    },
    [bonusAids.hints, bonusAids.shuffles, clearTimers, difficulty, isPortraitMode, userId],
  );

  const startRun = useCallback(
    (targetStage?: number) => {
      const startRules = modeRules(mode);
      setHeartsLeft(startRules.hearts);
      setBonusAids({ hints: 0, shuffles: 0 });
      setRunScore(0);
      setRunPairs(0);
      setRunBestStreak(0);
      setSummary(null);
      const stageToStart = targetStage ?? (mode === 'adventure' && profile.modes.adventure.bestStage > 1 ? profile.modes.adventure.bestStage : FIRST_STAGE);
      dealStage(mode, stageToStart);
    },
    [dealStage, mode, profile.modes.adventure.bestStage],
  );

  /**
   * Fold a finished stage into the run and, when the run itself is finished,
   * write it to the profile. Returns nothing — it drives phase instead.
   */
  const endStage = useCallback(
    (outcome: 'cleared' | 'failed') => {
      if (!round || !session) return;

      const stageScore = session.score;
      const cleared = outcome === 'cleared';
      const timeBonus = cleared && round.timed ? Math.max(0, timeLeft * 50) : 0;
      const totalScore = runScore + stageScore + timeBonus;
      const totalPairs = runPairs + session.matchedPairs;
      const bestStreak = Math.max(runBestStreak, session.bestStreak);
      const stars = rules.ladder ? stageStars(round.stage, { cleared, score: stageScore + timeBonus }) : 0;

      setRunScore(totalScore);
      setRunPairs(totalPairs);
      setRunBestStreak(bestStreak);

      let livesAfter = cleared ? heartsLeft : Math.max(0, heartsLeft - 1);
      let recoveredHeart = false;
      let recoveredAids = false;

      if (cleared && round.timed) {
        if (timeLeft >= 45 && heartsLeft < round.hearts) {
          livesAfter += 1;
          recoveredHeart = true;
          setHeartsLeft(livesAfter);
          showToast('❤️ SPEED MILESTONE! +1 Life restored!');
        }
        if (timeLeft >= 30) {
          recoveredAids = true;
          setBonusAids({ hints: 1, shuffles: 1 });
          setSession((s) => (s ? { ...s, hintsLeft: s.hintsLeft + 1, shufflesLeft: s.shufflesLeft + 1 } : s));
          showToast('✨ SPEED MILESTONE! +1 Hint & Shuffle for next stage!');
        }
      } else if (!cleared) {
        setHeartsLeft(livesAfter);
      }

      // Time Attack rolls straight into the next stage while the clock still
      // has seconds on it — stopping to read a panel is what kills the mode.
      if (cleared && round.mode === 'timeattack') {
        showToast(
          `Stage ${round.stage} cleared · +${stageScore.toLocaleString('en-US')}${
            timeBonus > 0 ? ` (+${timeBonus.toLocaleString('en-US')} speed)` : ''
          }`,
        );
        dealStage(round.mode, round.stage + 1, { keepClock: timeLeft });
        return;
      }

      const runContinues = cleared ? rules.ladder && round.mode === 'adventure' : livesAfter > 0;

      if (cleared && round.mode === 'adventure') {
        const checkpoint = loadProfile(userId);
        checkpoint.stageStars[String(round.stage)] = Math.max(checkpoint.stageStars[String(round.stage)] ?? 0, stars);
        checkpoint.modes.adventure.bestStage = Math.max(checkpoint.modes.adventure.bestStage, round.stage);
        saveProfile(checkpoint, userId);
        setProfile(checkpoint);

        // Submit milestone score immediately so stage progression is never lost if quit or refreshed
        submitScore({
          mode: 'adventure',
          score: totalScore,
          stage: round.stage,
          streak: bestStreak,
          pairs: totalPairs,
        })
          .then((res) => {
            if (res?.rank) {
              setSummary((prev) => (prev ? { ...prev, globalRank: res.rank } : prev));
            }
          })
          .catch(() => {
            /* offline or network error handled gracefully */
          });
      }

      const outcomeRecord = runContinues
        ? null
        : recordRun({
            mode: round.mode,
            score: totalScore,
            stage: round.stage,
            bestStreak,
            pairs: totalPairs,
            stars,
          }, new Date(), userId);

      if (outcomeRecord) setProfile(outcomeRecord.profile);

      setSummary({
        mode: round.mode,
        modeLabel: round.label,
        stage: round.stage,
        stars,
        runScore: totalScore,
        stageScore,
        timeBonus,
        timeLeft,
        recoveredHeart,
        recoveredAids,
        pairs: totalPairs,
        bestStreak,
        heartsLeft: livesAfter,
        records: outcomeRecord?.records ?? { score: false, stage: false, streak: false },
        previousBest: outcomeRecord?.previousBest ?? { score: 0, stage: 0, streak: 0 },
        newUnlocks: outcomeRecord?.newUnlocks ?? [],
      });

      if (!runContinues && round.mode !== 'zen') {
        submitScore({
          mode: round.mode,
          score: totalScore,
          stage: round.stage,
          streak: bestStreak,
          pairs: totalPairs,
        })
          .then((res) => {
            if (res?.rank) {
              setSummary((prev) => (prev ? { ...prev, globalRank: res.rank } : prev));
            }
          })
          .catch(() => {
            /* offline or network error handled gracefully */
          });
      }

      setPhase(runContinues ? (cleared ? 'cleared' : 'failed') : 'over');
      if (cleared) sfx.win();
    },
    [dealStage, heartsLeft, round, rules.ladder, runBestStreak, runPairs, runScore, session, showToast, timeLeft, userId],
  );

  /** The clock. Zen has none, and it never runs behind a panel. */
  useEffect(() => {
    if (phase !== 'playing' || introOpen || !round?.timed) return undefined;

    const id = window.setInterval(() => {
      // 1. Frozen clock:
      if (freezeLeftRef.current > 0) {
        const nextFreeze = freezeLeftRef.current - 1;
        freezeLeftRef.current = nextFreeze;
        setFreezeLeft(nextFreeze);
        return;
      }

      // 2. Active regular countdown:
      if (timeLeftRef.current > 0) {
        const next = timeLeftRef.current - 1;
        timeLeftRef.current = next;
        setTimeLeft(next);

        if (next <= CRITICAL_AT && next > 0) sfx.tick();

        if (next === 0) {
          if (!overtimeUsedRef.current) {
            overtimeUsedRef.current = true;
            setOvertimeUsed(true);
            overtimeLeftRef.current = 3;
            setOvertimeLeft(3);
            sfx.reject();
            showToast('⚡ OVERTIME! 3s to match or game over!');
          } else {
            if (session) expire(session);
            endStage('failed');
          }
        }
        return;
      }

      // 3. Overtime countdown:
      if (overtimeLeftRef.current > 0) {
        const nextOt = overtimeLeftRef.current - 1;
        overtimeLeftRef.current = nextOt;
        setOvertimeLeft(nextOt);
        if (nextOt > 0) {
          sfx.tick();
        } else {
          if (session) expire(session);
          endStage('failed');
        }
        return;
      }

      // 4. Time completely out:
      if (session) expire(session);
      endStage('failed');
    }, 1000);

    return () => window.clearInterval(id);
  }, [endStage, introOpen, phase, round?.timed, session, showToast]);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      introOpen ||
      !round?.timed ||
      timeLeft > 0 ||
      overtimeLeft > 0 ||
      !overtimeUsed ||
      !session
    ) {
      return undefined;
    }
    expire(session);
    // Deferred by a tick so the stage teardown is its own render, not a
    // cascading setState inside this effect's body.
    const id = window.setTimeout(() => endStage('failed'), 0);
    return () => window.clearTimeout(id);
  }, [endStage, introOpen, overtimeLeft, overtimeUsed, phase, round?.timed, session, timeLeft]);

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

      if (cracked.length > 0 || cleared.length > 0) {
        if (overtimeLeftRef.current > 0) {
          overtimeLeftRef.current = 0;
          setOvertimeLeft(0);
          const clutchRevival = 6;
          timeLeftRef.current = clutchRevival;
          setTimeLeft(clutchRevival);
          showToast('🔥 CLUTCH COMEBACK! +6s restored!');
          sfx.win();
        }
      }

      if (result.timeFreeze && result.timeFreeze > 0) {
        const nextFreeze = (freezeLeftRef.current || 0) + result.timeFreeze;
        freezeLeftRef.current = nextFreeze;
        setFreezeLeft(nextFreeze);
        showToast(`⏱ CHRONO SURGE! +8s & ${result.timeFreeze}s Freeze!`);
      }

      if (timeDelta !== 0) {
        setTimeLeft((left) => {
          const next = Math.max(0, left + timeDelta);
          timeLeftRef.current = next;
          if (next === 0 && left > 0 && !overtimeUsedRef.current) {
            overtimeUsedRef.current = true;
            setOvertimeUsed(true);
            overtimeLeftRef.current = 3;
            setOvertimeLeft(3);
            sfx.reject();
            showToast('⚡ OVERTIME! 3s to match or game over!');
          }
          return next;
        });
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

  /** The single button the result screen leads with: next stage, or try again / resume. */
  const continueRun = useCallback(() => {
    if (!round) return;
    setSummary(null);
    if (phase === 'cleared') {
      dealStage(round.mode, round.stage + 1);
    } else if (phase === 'failed') {
      dealStage(round.mode, round.stage);
    } else if (phase === 'over' && round.mode === 'adventure') {
      const startRules = modeRules('adventure');
      setHeartsLeft(startRules.hearts);
      setBonusAids({ hints: 0, shuffles: 0 });
      setRunScore(0);
      setRunPairs(0);
      setRunBestStreak(0);
      dealStage(round.mode, round.stage);
    }
  }, [dealStage, phase, round]);

  const retryRun = useCallback(() => {
    setSummary(null);
    startRun(FIRST_STAGE);
  }, [startRun]);

  const changeMode = useCallback(() => {
    // If quitting during an active run with a score, submit score so progress is not lost
    if (round && round.mode !== 'zen' && runScore > 0) {
      submitScore({
        mode: round.mode,
        score: runScore,
        stage: round.stage,
        streak: runBestStreak,
        pairs: runPairs,
      }).catch(() => {
        /* offline or network error handled gracefully */
      });
    }
    clearTimers();
    setSummary(null);
    setSession(null);
    setRound(null);
    setIntroOpen(false);
    setPhase('menu');
  }, [clearTimers, round, runBestStreak, runPairs, runScore]);

  const beginStage = useCallback(() => setIntroOpen(false), []);

  const jumpToStage = useCallback(
    (targetStage: number) => {
      const clamped = Math.max(FIRST_STAGE, Math.floor(targetStage));
      dealStage(mode, clamped);
      setPhase('playing');
      setIntroOpen(false);
    },
    [dealStage, mode],
  );

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
      unlocked: profile.unlocks?.length ?? 0,
      unlockTotal: 8,
      adventureBestStage: profile.modes?.adventure?.bestStage ?? 1,
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
      isUrgent: round.timed && timeLeft <= URGENT_AT && overtimeLeft === 0,
      isCritical: round.timed && (timeLeft <= CRITICAL_AT || overtimeLeft > 0),
      isOvertime: overtimeLeft > 0,
      overtimeLeft,
      isFrozen: freezeLeft > 0,
      freezeLeft,
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
  }, [freezeLeft, heartsLeft, overtimeLeft, profile, round, rules.ladder, runScore, session, timeLeft]);

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
    if (phase === 'failed') {
      const lives = Math.max(0, heartsLeft);
      return `Try stage ${round?.stage ?? 1} again · ${lives} ${lives === 1 ? 'life' : 'lives'} left`;
    }
    if (phase === 'over' && round?.mode === 'adventure') {
      return `Resume stage ${round?.stage ?? 1} ↺`;
    }
    return 'Try again';
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
    canContinue: phase === 'cleared' || phase === 'failed' || (phase === 'over' && round?.mode === 'adventure'),
    continueLabel,
    stageIntro: round
      ? { stage: round.stage, note: describeStage(round.stage), objective: stageObjective(round.stage).text, fresh: freshTwists(round.stage) }
      : null,
    selectMode,
    setDifficulty,
    startRun,
    jumpToStage,
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
