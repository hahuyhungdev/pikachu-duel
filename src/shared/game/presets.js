import { MAX_ICONS } from '../../game/icons.js';

const normalPreset = {
  label: 'Classic',
  difficultyLabel: 'Medium',
  rows: 9,
  cols: 16,
  iconCount: MAX_ICONS,
  hints: 2,
  shuffles: 2,
  level: 2,
};

/** Shared by the React setup screen, local game controller, and online rounds. */
export const PRESETS = {
  easy: {
    label: 'Quick',
    difficultyLabel: 'Easy',
    rows: 8,
    cols: 10,
    iconCount: 16,
    hints: 3,
    shuffles: 3,
    level: 1,
  },
  normal: normalPreset,
  medium: normalPreset,
  hard: {
    label: 'Grand',
    difficultyLabel: 'Hard',
    rows: 12,
    cols: 16,
    iconCount: MAX_ICONS,
    hints: 1,
    shuffles: 1,
    level: 3,
  },
};

export function normalizeDifficulty(difficulty) {
  if (difficulty === 'medium') return 'normal';
  if (PRESETS[difficulty]) return difficulty;
  return 'normal';
}

/**
 * Calculates next level and escalated difficulty.
 * Easy (Level 1) -> Medium (Level 2) -> Hard (Level 3) -> Escalated clock (-60s)
 */
export function calculateNextLevel(currentDifficulty, currentLevel = 1, currentClock = 300) {
  const normalized = normalizeDifficulty(currentDifficulty);
  const nextLevel = (Number(currentLevel) || 1) + 1;
  let nextDifficulty = 'hard';
  let nextClock = Number(currentClock) || 0;

  if (normalized === 'easy') {
    nextDifficulty = 'normal';
  } else if (normalized === 'normal') {
    nextDifficulty = 'hard';
  } else if (nextClock > 60) {
    nextClock = Math.max(60, nextClock - 60);
  }

  return {
    level: nextLevel,
    difficulty: nextDifficulty,
    clock: nextClock,
  };
}
