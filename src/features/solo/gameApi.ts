/**
 * Typed edge around the plain-JavaScript game core.
 *
 * `src/game/*` is deliberately untyped JavaScript so it can be tested with
 * `node --test` and shared with the relay worker. This module is the one place
 * that states what those functions actually return, so the React layer above it
 * gets real types instead of sprinkling casts at every call site.
 */

import {
  createSession as createSessionJs,
  requestHint as requestHintJs,
  requestShuffle as requestShuffleJs,
  select as selectJs,
  timeOut as timeOutJs,
  COMBO_TIERS as COMBO_TIERS_JS,
} from '../../game/session.js';
import { listMarks as listMarksJs } from '../../game/marks.js';
import { buildRound as buildRoundJs, modeRules as modeRulesJs, MODE_IDS as MODE_IDS_JS, MODES as MODES_JS } from '../../game/modes.js';
import { describeStage as describeStageJs, stageObjective as stageObjectiveJs, stageStars as stageStarsJs } from '../../game/stages.js';
import { GRAVITY_LABELS as GRAVITY_LABELS_JS } from '../../game/gravity.js';
import type { GameMode, Point, PlayerSession, Round, TileMark } from './types/solo.types';

/** Everything a live session tracks, including the combo fields. */
export interface SoloSession extends PlayerSession {
  tier: number;
  fever: boolean;
  gravity: string;
  timeGain: { match: number; fever: number };
}

/** What one tap can do. `crack` is a match that only broke a tile's ice. */
export type PickType = 'select' | 'deselect' | 'match' | 'crack' | 'mismatch' | 'blocked' | 'invalid';

export interface PickResult {
  type: PickType;
  tile?: Point;
  attempted?: Point[];
  path?: Point[];
  cleared?: Point[];
  cracked?: Point[];
  exploded?: Point[];
  moves?: Array<{ from: Point; to: Point }>;
  multiplier?: number;
  tier?: number;
  fever?: boolean;
  timeDelta?: number;
  timeFreeze?: number;
  gained?: number;
  won?: boolean;
  autoShuffled?: boolean;
}

export interface ModeRules {
  id: GameMode;
  label: string;
  blurb: string;
  ladder: boolean;
  timed: boolean;
  hearts: number;
  startClock: number;
  timeGain: { match: number; fever: number };
  tracksBest: 'score' | 'stage';
}

export interface SessionOptions {
  rows: number;
  cols: number;
  iconCount: number;
  iconPool?: readonly number[];
  seed: number;
  hints: number;
  shuffles: number;
  gravity: string;
  gold: number;
  chrono?: number;
  ice: number;
  bomb: number;
  bombFuse: number;
  timeGain: { match: number; fever: number };
  label: string;
}

export const COMBO_TIERS = COMBO_TIERS_JS as number[];
export const MODE_IDS = MODE_IDS_JS as GameMode[];
export const MODES = MODES_JS as Record<GameMode, ModeRules>;
export const GRAVITY_LABELS = GRAVITY_LABELS_JS as Record<string, string | undefined>;

export const createSession = (options: SessionOptions): SoloSession =>
  (createSessionJs as (o: unknown) => unknown)(options) as SoloSession;

export const pickTile = (session: SoloSession, r: number, c: number): PickResult =>
  selectJs(session, r, c) as PickResult;

export const takeHint = (session: SoloSession): unknown => requestHintJs(session);
export const takeShuffle = (session: SoloSession): boolean => Boolean(requestShuffleJs(session));
export const expire = (session: SoloSession): void => {
  timeOutJs(session);
};

export const listMarks = (board: PlayerSession['board']): TileMark[] => listMarksJs(board) as TileMark[];

export const buildRound = (options: {
  mode: GameMode;
  stage?: number;
  difficulty?: string;
  seed?: number;
  now?: Date;
  portrait?: boolean;
}): Round => buildRoundJs(options) as Round;

export const modeRules = (mode: GameMode | string): ModeRules => modeRulesJs(mode) as ModeRules;
export const describeStage = (stage: number): string => describeStageJs(stage) as string;
export const stageObjective = (stage: number): { target: number; text: string } =>
  stageObjectiveJs(stage) as { target: number; text: string };
export const stageStars = (stage: number, stats: { cleared: boolean; score: number }): number =>
  stageStarsJs(stage, stats) as number;
