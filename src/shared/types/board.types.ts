/**
 * Core game board data types shared across game modes (Solo, Duel, Practice).
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

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
  rush?: boolean;
  comboExpiresAt?: number;
  fever?: boolean;
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
