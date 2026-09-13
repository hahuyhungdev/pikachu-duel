/** The persisted account contract is shared with the worker. Only these fields cross the API. */
const MODES = ['classic', 'adventure', 'timeattack', 'daily', 'zen'];
const UNLOCK_IDS = ['first-clear', 'pairs-100', 'streak-10', 'stage-5', 'days-3', 'pairs-1000', 'streak-20', 'stage-15'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value) => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(1e9, Math.max(0, Math.floor(value))) : 0;
const day = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;

export function normalizeProgress(input) {
  const value = record(input) ? input : {};
  const modes = Object.fromEntries(MODES.map((mode) => {
    const source = record(value.modes) && record(value.modes[mode]) ? value.modes[mode] : {};
    return [mode, Object.fromEntries(['bestScore', 'bestStage', 'bestStreak', 'plays'].map((key) => [key, count(source[key])]))];
  }));
  const stageStars = {};
  if (record(value.stageStars)) {
    for (const [stage, stars] of Object.entries(value.stageStars)) {
      if (/^[1-9]\d{0,3}$/.test(stage) && typeof stars === 'number' && Number.isFinite(stars)) {
        stageStars[stage] = Math.min(3, count(stars));
      }
    }
  }
  const daily = record(value.daily) && day(value.daily.day)
    ? { day: value.daily.day, score: count(value.daily.score), stars: Math.min(3, count(value.daily.stars)) } : null;
  return {
    version: 2, modes,
    totalPairs: count(value.totalPairs), totalPlays: count(value.totalPlays),
    dayStreak: count(value.dayStreak), lastPlayedDay: day(value.lastPlayedDay),
    daily, unlocks: UNLOCK_IDS.filter((id) => Array.isArray(value.unlocks) && value.unlocks.includes(id)),
    stageStars,
  };
}

/** Snapshot maxima make retries idempotent. Independent offline counters are not summed. */
export function mergeProgress(left, right) {
  const a = normalizeProgress(left);
  const b = normalizeProgress(right);
  for (const mode of MODES) {
    for (const key of ['bestScore', 'bestStage', 'bestStreak', 'plays']) {
      a.modes[mode][key] = Math.max(a.modes[mode][key], b.modes[mode][key]);
    }
  }
  a.totalPairs = Math.max(a.totalPairs, b.totalPairs);
  a.totalPlays = Math.max(a.totalPlays, b.totalPlays);
  if ((b.lastPlayedDay ?? '') > (a.lastPlayedDay ?? '')) {
    a.lastPlayedDay = b.lastPlayedDay;
    a.dayStreak = b.dayStreak;
  } else if (a.lastPlayedDay === b.lastPlayedDay) a.dayStreak = Math.max(a.dayStreak, b.dayStreak);
  if (b.daily && (!a.daily || b.daily.day > a.daily.day)) a.daily = b.daily;
  else if (b.daily && a.daily?.day === b.daily.day) {
    a.daily.score = Math.max(a.daily.score, b.daily.score);
    a.daily.stars = Math.max(a.daily.stars, b.daily.stars);
  }
  a.unlocks = UNLOCK_IDS.filter((id) => a.unlocks.includes(id) || b.unlocks.includes(id));
  for (const [stage, stars] of Object.entries(b.stageStars)) {
    a.stageStars[stage] = Math.max(a.stageStars[stage] ?? 0, stars);
  }
  return a;
}
