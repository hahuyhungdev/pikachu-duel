/**
 * The player profile that survives between sessions: personal bests, day
 * streaks, unlocks and per-stage stars.
 *
 * Losing a round should still move something forward, so every finished run is
 * folded in here and the caller gets back exactly what improved — enough for a
 * result screen to say "1,240 -> 1,890" or to hand out a fresh unlock.
 *
 * Storage is best effort. Private browsing, blocked cookies and a full quota
 * must all degrade to a default profile, never to a thrown error mid-game.
 */

export type GameMode = 'classic' | 'adventure' | 'timeattack' | 'daily' | 'zen';

export interface ModeRecord {
  bestScore: number;
  bestStage: number;
  bestStreak: number;
  plays: number;
}

export interface Profile {
  version: number;
  modes: Record<GameMode, ModeRecord>;
  totalPairs: number;
  totalPlays: number;
  dayStreak: number;
  lastPlayedDay: string | null;
  daily: { day: string; score: number; stars: number } | null;
  unlocks: string[];
  stageStars: Record<string, number>;
}

export interface RunResult {
  mode: GameMode;
  score: number;
  stage: number;
  bestStreak: number;
  pairs: number;
  stars?: number;
}

export interface Unlock {
  id: string;
  label: string;
  detail: string;
}

export interface RunOutcome {
  profile: Profile;
  records: { score: boolean; stage: boolean; streak: boolean };
  previousBest: { score: number; stage: number; streak: number };
  newUnlocks: Unlock[];
  dayStreak: number;
}

export const STORAGE_KEY = 'pikachu-duel/profile';
export const PROFILE_VERSION = 2;

export function profileStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}/account/${encodeURIComponent(userId)}` : STORAGE_KEY;
}

type ProfileListener = (profile: Profile, userId: string | null) => void;
const profileListeners = new Set<ProfileListener>();

export function subscribeProfile(listener: ProfileListener): () => void {
  profileListeners.add(listener);
  return () => { profileListeners.delete(listener); };
}

const MAX_STARS = 3;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Requirements live next to their unlock so the catalogue stays one list. */
interface UnlockDefinition extends Unlock {
  earned: (profile: Profile) => boolean;
}

function bestStreakAnywhere(profile: Profile): number {
  return Object.values(profile.modes).reduce((best, mode) => Math.max(best, mode.bestStreak), 0);
}

const DEFINITIONS: readonly UnlockDefinition[] = [
  {
    id: 'first-clear',
    label: 'First Clear',
    detail: 'Finish your first run in any mode.',
    earned: (profile) => profile.totalPlays >= 1,
  },
  {
    id: 'pairs-100',
    label: 'Century',
    detail: 'Clear 100 pairs in total.',
    earned: (profile) => profile.totalPairs >= 100,
  },
  {
    id: 'streak-10',
    label: 'Combo Artist',
    detail: 'Chain 10 matches without a miss.',
    earned: (profile) => bestStreakAnywhere(profile) >= 10,
  },
  {
    id: 'stage-5',
    label: 'Ladder Climber',
    detail: 'Reach stage 5 in Adventure.',
    earned: (profile) => profile.modes.adventure.bestStage >= 5,
  },
  {
    id: 'days-3',
    label: 'Regular',
    detail: 'Play on three days in a row.',
    earned: (profile) => profile.dayStreak >= 3,
  },
  {
    id: 'pairs-1000',
    label: 'Board Sweeper',
    detail: 'Clear 1,000 pairs in total.',
    earned: (profile) => profile.totalPairs >= 1000,
  },
  {
    id: 'streak-20',
    label: 'Untouchable',
    detail: 'Chain 20 matches without a miss.',
    earned: (profile) => bestStreakAnywhere(profile) >= 20,
  },
  {
    id: 'stage-15',
    label: 'Summit',
    detail: 'Reach stage 15 in Adventure.',
    earned: (profile) => profile.modes.adventure.bestStage >= 15,
  },
];

export const UNLOCKS: readonly Unlock[] = DEFINITIONS.map(({ id, label, detail }) => ({
  id,
  label,
  detail,
}));

/** Reaching for localStorage can itself throw, so even the lookup is guarded. */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(userId?: string | null): string | null {
  try {
    return storage()?.getItem(profileStorageKey(userId)) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(value: string | null, userId?: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (value === null) store.removeItem(profileStorageKey(userId));
    else store.setItem(profileStorageKey(userId), value);
  } catch {
    // Quota, private mode or a blocked origin: progress is simply not kept.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every stored number is a non-negative whole count; anything else is noise. */
function toCount(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function toStars(value: unknown): number {
  return Math.min(MAX_STARS, toCount(value));
}

function emptyRecord(): ModeRecord {
  return { bestScore: 0, bestStage: 0, bestStreak: 0, plays: 0 };
}

function toModeRecord(value: unknown): ModeRecord {
  if (!isRecord(value)) return emptyRecord();
  return {
    bestScore: toCount(value.bestScore),
    bestStage: toCount(value.bestStage),
    bestStreak: toCount(value.bestStreak),
    plays: toCount(value.plays),
  };
}

function toModes(value: unknown): Record<GameMode, ModeRecord> {
  const source = isRecord(value) ? value : {};
  return {
    classic: toModeRecord(source.classic),
    adventure: toModeRecord(source.adventure),
    timeattack: toModeRecord(source.timeattack),
    daily: toModeRecord(source.daily),
    zen: toModeRecord(source.zen),
  };
}

function toDayKey(value: unknown): string | null {
  return typeof value === 'string' && DAY_PATTERN.test(value) ? value : null;
}

function toDaily(value: unknown): Profile['daily'] {
  if (!isRecord(value)) return null;
  const day = toDayKey(value.day);
  if (!day) return null;
  return { day, score: toCount(value.score), stars: toStars(value.stars) };
}

function toUnlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

function toStageStars(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const stars: Record<string, number> = {};
  for (const [stage, rating] of Object.entries(value)) {
    if (!/^\d+$/.test(stage)) continue;
    if (typeof rating !== 'number' || !Number.isFinite(rating)) continue;
    stars[stage] = toStars(rating);
  }
  return stars;
}

function createProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    modes: toModes(undefined),
    totalPairs: 0,
    totalPlays: 0,
    dayStreak: 0,
    lastPlayedDay: null,
    daily: null,
    unlocks: [],
    stageStars: {},
  };
}

/**
 * Migration is deliberately field-by-field: an older or half-written profile
 * keeps every value we still understand and gains defaults for the rest.
 */
function normalize(value: unknown): Profile {
  if (!isRecord(value)) return createProfile();
  return {
    version: PROFILE_VERSION,
    modes: toModes(value.modes),
    totalPairs: toCount(value.totalPairs),
    totalPlays: toCount(value.totalPlays),
    dayStreak: toCount(value.dayStreak),
    lastPlayedDay: toDayKey(value.lastPlayedDay),
    daily: toDaily(value.daily),
    unlocks: toUnlocks(value.unlocks),
    stageStars: toStageStars(value.stageStars),
  };
}

export { normalize as normalizeProfile };

export function loadProfile(userId?: string | null): Profile {
  const raw = readRaw(userId);
  if (!raw) return createProfile();
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return createProfile();
  }
}

export function saveProfile(profile: Profile, userId?: string | null, notify = true): void {
  try {
    writeRaw(JSON.stringify(profile), userId);
    if (notify) for (const listener of profileListeners) listener(profile, userId ?? null);
  } catch {
    // A profile that cannot be serialised is dropped rather than fatal.
  }
}

export function resetProfile(userId?: string | null): Profile {
  const profile = createProfile();
  saveProfile(profile, userId);
  return profile;
}

/** Local-time day key, because "today" means the player's midnight, not UTC. */
function dayKeyOf(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days apart, rounded so daylight-saving shifts cannot break a streak. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd).getTime();
  const end = new Date(ty, tm - 1, td).getTime();
  return Math.round((end - start) / DAY_MS);
}

function nextDayStreak(lastPlayedDay: string | null, today: string, current: number): number {
  if (!lastPlayedDay) return 1;
  const gap = daysBetween(lastPlayedDay, today);
  if (gap === 0) return Math.max(1, current);
  if (gap === 1) return Math.max(1, current) + 1;
  return 1;
}

export function evaluateUnlocks(profile: Profile): Unlock[] {
  return DEFINITIONS.filter((definition) => definition.earned(profile)).map(
    ({ id, label, detail }) => ({ id, label, detail }),
  );
}

export function isUnlocked(profile: Profile, id: string): boolean {
  return profile.unlocks.includes(id);
}

/**
 * Fold one finished run into the stored profile and report what moved:
 * which records fell, what they used to be, and which unlocks this run earned.
 */
export function recordRun(result: RunResult, now: Date = new Date(), userId?: string | null): RunOutcome {
  const profile = loadProfile(userId);
  const record = profile.modes[result.mode];

  const score = toCount(result.score);
  const stage = toCount(result.stage);
  const streak = toCount(result.bestStreak);
  const pairs = toCount(result.pairs);

  const previousBest = {
    score: record.bestScore,
    stage: record.bestStage,
    streak: record.bestStreak,
  };
  const records = {
    score: score > previousBest.score,
    stage: stage > previousBest.stage,
    streak: streak > previousBest.streak,
  };

  if (records.score) record.bestScore = score;
  if (records.stage) record.bestStage = stage;
  if (records.streak) record.bestStreak = streak;
  record.plays += 1;
  profile.totalPlays += 1;
  profile.totalPairs += pairs;

  const today = dayKeyOf(now);
  profile.dayStreak = nextDayStreak(profile.lastPlayedDay, today, profile.dayStreak);
  profile.lastPlayedDay = today;

  if (result.stars !== undefined && result.mode === 'adventure') {
    const key = String(stage);
    profile.stageStars[key] = Math.max(profile.stageStars[key] ?? 0, toStars(result.stars));
  }

  // The daily slot only ever holds today's attempt, at its best.
  if (result.mode === 'daily') {
    const stars = toStars(result.stars);
    const sameDay = profile.daily?.day === today ? profile.daily : null;
    profile.daily = {
      day: today,
      score: Math.max(sameDay?.score ?? 0, score),
      stars: Math.max(sameDay?.stars ?? 0, stars),
    };
  }

  const alreadyEarned = new Set(profile.unlocks);
  const newUnlocks = evaluateUnlocks(profile).filter((unlock) => !alreadyEarned.has(unlock.id));
  profile.unlocks = [...profile.unlocks, ...newUnlocks.map((unlock) => unlock.id)];

  saveProfile(profile, userId);

  return { profile, records, previousBest, newUnlocks, dayStreak: profile.dayStreak };
}
