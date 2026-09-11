export type Difficulty = 'easy' | 'normal' | 'hard';
export type DuelMode = 'solo' | 'local' | 'online';

export interface Point {
  r: number;
  c: number;
}

export interface BoardData {
  rows: number;
  cols: number;
  cells: Uint8Array;
  remaining: number;
}

export interface PlayerSession {
  label: string;
  seed: number;
  board: BoardData;
  status: 'playing' | 'won' | 'lost';
  selected: Point | null;
  hint: { a: Point; b: Point; path: Point[] } | null;
  score: number;
  matchedPairs: number;
  streak: number;
  bestStreak: number;
  mistakes: number;
  hintsLeft: number;
  shufflesLeft: number;
  reshuffles: number;
}

export interface TracePath {
  id: string;
  d: string;
}

export interface Floater {
  id: string;
  point: Point;
  text: string;
}

export interface VeilInfo {
  headline: string;
  detail?: string;
}

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
}

export interface DuelSetup {
  mode: DuelMode;
  names: [string, string];
  difficulty: Difficulty;
  clock: number;
  level?: number;
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
  settings: { difficulty: Difficulty; clock: number };
  status: 'lobby' | 'playing' | 'over';
  linkState?: string;
  link: string;
  note: string;
}
