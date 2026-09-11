/**
 * The shape of a solo run.
 *
 * A "run" is one attempt at a mode: in Adventure it spans many stages and ends
 * when the lives do, in Daily it is a single board. Everything the HUD and the
 * result screen need is derived once in `useSolo` and handed down as plain
 * props, so the views stay dumb and testable.
 */

import type { Difficulty, Point, PlayerSession } from '../../duel/types/duel.types';
import type { GameMode, Unlock } from '../../../shared/game/profile';

export type { GameMode, Unlock };

/** Where the run is right now. */
export type RunPhase =
  | 'menu'
  /** A board is live and the clock is running. */
  | 'playing'
  /** The board was emptied; the stage summary is up. */
  | 'cleared'
  /** The clock ran out but a life remains; the retry prompt is up. */
  | 'failed'
  /** The run is finished for good and has been written to the profile. */
  | 'over';

/** One special tile the board is currently showing. */
export interface TileMark {
  r: number;
  c: number;
  mark: number;
  fuse: number;
}

/** A tile that slid because of gravity, in cell deltas, for the slide animation. */
export interface TileSlide {
  key: string;
  dr: number;
  dc: number;
}

/** The concrete recipe a round was dealt from — the output of `buildRound`. */
export interface Round {
  mode: GameMode;
  label: string;
  stage: number;
  seed: number;
  rows: number;
  cols: number;
  pairs: number;
  iconCount: number;
  clock: number;
  timed: boolean;
  hearts: number;
  timeGain: { match: number; fever: number };
  hints: number;
  shuffles: number;
  gravity: string;
  gold: number;
  chrono: number;
  ice: number;
  bomb: number;
  bombFuse: number;
  stars: { silver: number; gold: number };
  day: string | null;
}

/** What the player beat (or failed to beat) this run, for the result screen. */
export interface RunRecords {
  score: boolean;
  stage: boolean;
  streak: boolean;
}

export interface RunBests {
  score: number;
  stage: number;
  streak: number;
}

export interface RunSummary {
  mode: GameMode;
  modeLabel: string;
  stage: number;
  stars: number;
  runScore: number;
  stageScore: number;
  pairs: number;
  bestStreak: number;
  heartsLeft: number;
  records: RunRecords;
  previousBest: RunBests;
  newUnlocks: Unlock[];
  timeBonus?: number;
  timeLeft?: number;
  recoveredHeart?: boolean;
  recoveredAids?: boolean;
}

/** One entry in the mode menu. */
export interface ModeCard {
  id: GameMode;
  label: string;
  blurb: string;
  /** The number worth bragging about for this mode, already formatted. */
  bestLabel: string;
  bestValue: string;
  /** Daily is one attempt — once spent, the card says so. */
  spent: boolean;
}

export interface ProfileSummary {
  dayStreak: number;
  totalPairs: number;
  totalPlays: number;
  unlocked: number;
  unlockTotal: number;
}

export interface SoloHud {
  mode: GameMode;
  modeLabel: string;
  stage: number;
  stageNote: string;
  objective: string | null;
  timed: boolean;
  timeLeft: number;
  isUrgent: boolean;
  isCritical: boolean;
  isOvertime?: boolean;
  overtimeLeft?: number;
  isFrozen?: boolean;
  freezeLeft?: number;
  hearts: number;
  heartsLeft: number;
  score: number;
  runScore: number;
  streak: number;
  tier: number;
  fever: boolean;
  /** 0..1 progress toward the next combo tier, for the meter. */
  comboProgress: number;
  hintsLeft: number;
  shufflesLeft: number;
  pairsLeft: number;
  totalPairs: number;
  bestScore: number;
}

export interface SoloBoardView {
  session: PlayerSession;
  marks: TileMark[];
  slides: TileSlide[];
  clearingTiles: string[];
  shakingTiles: string[];
  crackingTiles: string[];
  traces: Array<{ id: string; d: string }>;
  floaters: Array<{ id: string; point: Point; text: string }>;
}

export type { Difficulty, PlayerSession, Point };
