/**
 * Persistent account progress schema, normalization, and merge resolution.
 *
 * Implements an idempotent CRDT-like merge strategy across local offline storage
 * and remote Cloudflare Worker account persistence.
 */

/** Schema version identifier for stored account progress payloads. */
export const PROGRESS_SCHEMA_VERSION = 2;

/** Maximum numerical threshold capping counters to prevent overflow attacks. */
export const MAX_SAFE_COUNTER = 1_000_000_000;

/** Maximum star rating achievable on any individual stage. */
export const MAX_STARS_PER_STAGE = 3;

/** Tracked game modes recorded in user statistics. */
export const TRACKED_PROGRESS_MODES = [
  'classic',
  'adventure',
  'timeattack',
  'daily',
  'zen',
] as const;

export type TrackedProgressMode = (typeof TRACKED_PROGRESS_MODES)[number];

/** Valid achievement badge identifiers. */
export const VALID_UNLOCK_IDS = [
  'first-clear',
  'pairs-100',
  'streak-10',
  'stage-5',
  'days-3',
  'pairs-1000',
  'streak-20',
  'stage-15',
] as const;

export type UnlockId = (typeof VALID_UNLOCK_IDS)[number];

/** Performance counters for a specific gameplay mode. */
export interface ModeProgressRecord {
  bestScore: number;
  bestStage: number;
  bestStreak: number;
  plays: number;
}

/** Record of performance on a specific daily challenge date. */
export interface DailyProgressRecord {
  day: string;
  score: number;
  stars: number;
}

/** Complete normalized structure of a user's account progress. */
export interface NormalizedProgress {
  version: number;
  modes: Record<TrackedProgressMode, ModeProgressRecord>;
  totalPairs: number;
  totalPlays: number;
  dayStreak: number;
  lastPlayedDay: string | null;
  daily: DailyProgressRecord | null;
  unlocks: UnlockId[];
  stageStars: Record<string, number>;
}

/** Type guard checking whether a value is a non-null, non-array object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Normalizes and clamps an integer counter into [0, MAX_SAFE_COUNTER]. */
const clampCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_SAFE_COUNTER, Math.max(0, Math.floor(value)))
    : 0;

/** Validates ISO calendar date format YYYY-MM-DD. */
const parseDay = (value: unknown): string | null =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
    ? value
    : null;

/**
 * Normalizes untrusted progress data into a valid, conforming `NormalizedProgress` object.
 *
 * @param input - Raw or partial progress data.
 * @returns Clean, type-safe `NormalizedProgress`.
 */
export function normalizeProgress(input: unknown): NormalizedProgress {
  const value = isRecord(input) ? input : {};

  const modes = Object.fromEntries(
    TRACKED_PROGRESS_MODES.map((mode) => {
      const source =
        isRecord(value.modes) && isRecord(value.modes[mode])
          ? (value.modes[mode] as Record<string, unknown>)
          : {};
      return [
        mode,
        {
          bestScore: clampCount(source.bestScore),
          bestStage: clampCount(source.bestStage),
          bestStreak: clampCount(source.bestStreak),
          plays: clampCount(source.plays),
        },
      ];
    })
  ) as Record<TrackedProgressMode, ModeProgressRecord>;

  const stageStars: Record<string, number> = {};
  if (isRecord(value.stageStars)) {
    for (const [stage, stars] of Object.entries(value.stageStars)) {
      if (/^[1-9]\d{0,3}$/.test(stage) && typeof stars === 'number' && Number.isFinite(stars)) {
        stageStars[stage] = Math.min(MAX_STARS_PER_STAGE, clampCount(stars));
      }
    }
  }

  const rawDaily = isRecord(value.daily) ? value.daily : null;
  const validDailyDay = rawDaily ? parseDay(rawDaily.day) : null;
  const daily: DailyProgressRecord | null =
    rawDaily && validDailyDay
      ? {
          day: validDailyDay,
          score: clampCount(rawDaily.score),
          stars: Math.min(MAX_STARS_PER_STAGE, clampCount(rawDaily.stars)),
        }
      : null;

  const rawUnlocks = Array.isArray(value.unlocks) ? value.unlocks : [];
  const unlocks: UnlockId[] = (VALID_UNLOCK_IDS as readonly string[]).filter((id): id is UnlockId =>
    rawUnlocks.includes(id)
  );

  return {
    version: PROGRESS_SCHEMA_VERSION,
    modes,
    totalPairs: clampCount(value.totalPairs),
    totalPlays: clampCount(value.totalPlays),
    dayStreak: clampCount(value.dayStreak),
    lastPlayedDay: parseDay(value.lastPlayedDay),
    daily,
    unlocks,
    stageStars,
  };
}

/**
 * Merges two progress snapshots idempotently taking monotonic maxima for counters
 * and union of unlocked badges.
 *
 * @param left - First progress snapshot.
 * @param right - Second progress snapshot.
 * @returns Combined progress snapshot.
 */
export function mergeProgress(left: unknown, right: unknown): NormalizedProgress {
  const a = normalizeProgress(left);
  const b = normalizeProgress(right);

  for (const mode of TRACKED_PROGRESS_MODES) {
    const keys: (keyof ModeProgressRecord)[] = ['bestScore', 'bestStage', 'bestStreak', 'plays'];
    for (const key of keys) {
      a.modes[mode][key] = Math.max(a.modes[mode][key], b.modes[mode][key]);
    }
  }

  a.totalPairs = Math.max(a.totalPairs, b.totalPairs);
  a.totalPlays = Math.max(a.totalPlays, b.totalPlays);

  if ((b.lastPlayedDay ?? '') > (a.lastPlayedDay ?? '')) {
    a.lastPlayedDay = b.lastPlayedDay;
    a.dayStreak = b.dayStreak;
  } else if (a.lastPlayedDay === b.lastPlayedDay) {
    a.dayStreak = Math.max(a.dayStreak, b.dayStreak);
  }

  if (b.daily && (!a.daily || b.daily.day > a.daily.day)) {
    a.daily = b.daily;
  } else if (b.daily && a.daily?.day === b.daily.day) {
    a.daily.score = Math.max(a.daily.score, b.daily.score);
    a.daily.stars = Math.max(a.daily.stars, b.daily.stars);
  }

  a.unlocks = (VALID_UNLOCK_IDS as readonly string[]).filter(
    (id): id is UnlockId => a.unlocks.includes(id as UnlockId) || b.unlocks.includes(id as UnlockId)
  );

  for (const [stage, stars] of Object.entries(b.stageStars)) {
    a.stageStars[stage] = Math.max(a.stageStars[stage] ?? 0, stars);
  }

  return a;
}
