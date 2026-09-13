export type Difficulty = 'easy' | 'normal' | 'hard';
export type DuelMode = 'solo' | 'local' | 'online';
export type DuelRules = 'classic' | 'rush';

export type { Point, BoardData, PlayerSession, TracePath, Floater, VeilInfo } from '../../../shared/types/board.types';
import type { Point, PlayerSession, TracePath, Floater, VeilInfo } from '../../../shared/types/board.types';

export interface PlayerState {
  index: number;
  label: string;
  session: PlayerSession;
  totalPairs: number;
  cursor: Point | null;
  clearingTiles: string[];
  shakingTiles: string[];
  traces: TracePath[];
  floaters: Floater[];
  veil: VeilInfo | null;
  remote?: boolean;
  remoteState?: string;
  finishedAt?: number | null;
  comboRemainingMs?: number;
}

export interface DuelSetup {
  mode: DuelMode;
  names: [string, string];
  difficulty: Difficulty;
  clock: number;
  level?: number;
  rules?: DuelRules;
}

export interface ActiveDuel {
  mode: DuelMode;
  seed: number;
  setup: DuelSetup;
  limit: number;
  elapsed: number;
  level: number;
  over: boolean;
  winner: number;
  reason: 'cleared' | 'time' | 'disconnect' | null;
  reported?: boolean;
}

export interface OnlinePeer {
  id: string;
  name: string;
}

export interface OnlineState {
  code: string;
  name: string;
  you: string | null;
  hostId: string | null;
  foeId: string | null;
  players: OnlinePeer[];
  settings: { difficulty: Difficulty; clock: number; rules?: DuelRules };
  status: 'lobby' | 'playing' | 'over';
  linkState?: string;
  link: string;
  note: string;
}
