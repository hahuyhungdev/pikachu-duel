import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_VERSION,
  STORAGE_KEY,
  UNLOCKS,
  evaluateUnlocks,
  isUnlocked,
  loadProfile,
  recordRun,
  resetProfile,
  saveProfile,
  type GameMode,
  type Profile,
  type RunResult,
} from './profile';

const MODES: GameMode[] = ['classic', 'adventure', 'timeattack', 'daily', 'zen'];

/** A run with sane defaults so each test only states what it cares about. */
function run(overrides: Partial<RunResult> = {}): RunResult {
  return { mode: 'classic', score: 100, stage: 1, bestStreak: 1, pairs: 5, ...overrides };
}

function day(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('loadProfile', () => {
  it('returns a complete default profile when storage is empty', () => {
    const profile = loadProfile();

    expect(profile.version).toBe(PROFILE_VERSION);
    expect(Object.keys(profile.modes).sort()).toEqual([...MODES].sort());
    for (const mode of MODES) {
      expect(profile.modes[mode]).toEqual({ bestScore: 0, bestStage: 0, bestStreak: 0, plays: 0 });
    }
    expect(profile.totalPairs).toBe(0);
    expect(profile.totalPlays).toBe(0);
    expect(profile.dayStreak).toBe(0);
    expect(profile.lastPlayedDay).toBeNull();
    expect(profile.daily).toBeNull();
    expect(profile.unlocks).toEqual([]);
    expect(profile.stageStars).toEqual({});
  });

  it('recovers from malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json at all');
    expect(() => loadProfile()).not.toThrow();
    expect(loadProfile().totalPlays).toBe(0);
  });

  it('recovers from stored values that are not objects', () => {
    for (const raw of ['42', '"hello"', 'null', 'true', '[1,2,3]']) {
      localStorage.setItem(STORAGE_KEY, raw);
      const profile = loadProfile();
      expect(profile.version).toBe(PROFILE_VERSION);
      expect(profile.modes.classic.plays).toBe(0);
    }
  });

  it('fills in missing keys without throwing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: PROFILE_VERSION, totalPairs: 12 }));
    const profile = loadProfile();

    expect(profile.totalPairs).toBe(12);
    expect(profile.totalPlays).toBe(0);
    expect(profile.modes.zen).toEqual({ bestScore: 0, bestStage: 0, bestStreak: 0, plays: 0 });
    expect(profile.unlocks).toEqual([]);
    expect(profile.stageStars).toEqual({});
  });

  it('repairs individual fields of the wrong type', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PROFILE_VERSION,
        modes: { classic: 'nope', adventure: { bestScore: '750', bestStage: 2.7, plays: -4 } },
        totalPairs: 'many',
        dayStreak: null,
        lastPlayedDay: 17,
        daily: 'yesterday',
        unlocks: ['pairs-100', 5, null],
        stageStars: { '3': 9, '4': 'two' },
      }),
    );
    const profile = loadProfile();

    expect(profile.modes.classic).toEqual({ bestScore: 0, bestStage: 0, bestStreak: 0, plays: 0 });
    expect(profile.modes.adventure).toEqual({ bestScore: 750, bestStage: 2, bestStreak: 0, plays: 0 });
    expect(profile.totalPairs).toBe(0);
    expect(profile.dayStreak).toBe(0);
    expect(profile.lastPlayedDay).toBeNull();
    expect(profile.daily).toBeNull();
    expect(profile.unlocks).toEqual(['pairs-100']);
    expect(profile.stageStars).toEqual({ '3': 3 });
  });

  it('never throws when getItem itself throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage is disabled');
    });

    expect(() => loadProfile()).not.toThrow();
    expect(loadProfile().version).toBe(PROFILE_VERSION);
  });

  it('never throws when localStorage access itself throws (private mode)', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: access denied');
      },
    });

    try {
      expect(() => loadProfile()).not.toThrow();
      expect(loadProfile().totalPlays).toBe(0);
      expect(() => saveProfile(loadProfile())).not.toThrow();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });

  it('migrates an older version by filling defaults instead of discarding records', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: PROFILE_VERSION - 1,
        modes: { classic: { bestScore: 4200, bestStage: 3, bestStreak: 11, plays: 9 } },
        totalPairs: 640,
        totalPlays: 9,
        unlocks: ['pairs-100'],
      }),
    );
    const profile = loadProfile();

    expect(profile.version).toBe(PROFILE_VERSION);
    expect(profile.modes.classic).toEqual({ bestScore: 4200, bestStage: 3, bestStreak: 11, plays: 9 });
    expect(profile.modes.timeattack).toEqual({ bestScore: 0, bestStage: 0, bestStreak: 0, plays: 0 });
    expect(profile.totalPairs).toBe(640);
    expect(profile.unlocks).toEqual(['pairs-100']);
  });
});

describe('saveProfile', () => {
  it('keeps guest and each account progress isolated across reloads', () => {
    recordRun(run({ score: 100 }));
    recordRun(run({ score: 900 }), undefined, 'account-a');
    recordRun(run({ score: 400 }), undefined, 'account-b');
    expect(loadProfile().modes.classic.bestScore).toBe(100);
    expect(loadProfile('account-a').modes.classic.bestScore).toBe(900);
    expect(loadProfile('account-b').modes.classic.bestScore).toBe(400);
    expect(loadProfile('new-account').totalPlays).toBe(0);
    resetProfile('account-b');
    expect(loadProfile('account-b').totalPlays).toBe(0);
    expect(loadProfile('account-a').totalPlays).toBe(1);
  });

  it('round-trips a profile through storage', () => {
    const profile = loadProfile();
    profile.totalPairs = 33;
    profile.modes.zen.plays = 2;
    saveProfile(profile);

    const reloaded = loadProfile();
    expect(reloaded.totalPairs).toBe(33);
    expect(reloaded.modes.zen.plays).toBe(2);
  });

  it('swallows quota and security errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveProfile(loadProfile())).not.toThrow();
    expect(() => recordRun(run())).not.toThrow();
  });
});

describe('resetProfile', () => {
  it('wipes stored progress and returns a fresh profile', () => {
    recordRun(run({ score: 900, pairs: 40 }));
    const fresh = resetProfile();

    expect(fresh.totalPlays).toBe(0);
    expect(fresh.totalPairs).toBe(0);
    expect(loadProfile().totalPairs).toBe(0);
  });
});

describe('recordRun totals and records', () => {
  it('raises per-mode bests and reports which records fell', () => {
    recordRun(run({ mode: 'timeattack', score: 1240, stage: 1, bestStreak: 6, pairs: 12 }));
    const outcome = recordRun(run({ mode: 'timeattack', score: 1890, stage: 1, bestStreak: 9, pairs: 14 }));

    expect(outcome.previousBest).toEqual({ score: 1240, stage: 1, streak: 6 });
    expect(outcome.records).toEqual({ score: true, stage: false, streak: true });
    expect(outcome.profile.modes.timeattack).toEqual({
      bestScore: 1890,
      bestStage: 1,
      bestStreak: 9,
      plays: 2,
    });
  });

  it('keeps old bests when the run is worse and reports no records', () => {
    recordRun(run({ mode: 'classic', score: 5000, stage: 4, bestStreak: 20, pairs: 30 }));
    const outcome = recordRun(run({ mode: 'classic', score: 10, stage: 1, bestStreak: 2, pairs: 3 }));

    expect(outcome.records).toEqual({ score: false, stage: false, streak: false });
    expect(outcome.previousBest).toEqual({ score: 5000, stage: 4, streak: 20 });
    expect(outcome.profile.modes.classic.bestScore).toBe(5000);
    expect(outcome.profile.modes.classic.bestStage).toBe(4);
    expect(outcome.profile.modes.classic.bestStreak).toBe(20);
  });

  it('treats an equalled best as not beaten', () => {
    recordRun(run({ score: 777, stage: 3, bestStreak: 8 }));
    const outcome = recordRun(run({ score: 777, stage: 3, bestStreak: 8 }));

    expect(outcome.records).toEqual({ score: false, stage: false, streak: false });
  });

  it('always counts plays and pairs, and keeps modes independent', () => {
    recordRun(run({ mode: 'classic', score: 100, pairs: 7 }));
    recordRun(run({ mode: 'classic', score: 50, pairs: 4 }));
    const outcome = recordRun(run({ mode: 'zen', score: 10, pairs: 2 }));

    expect(outcome.profile.modes.classic.plays).toBe(2);
    expect(outcome.profile.modes.zen.plays).toBe(1);
    expect(outcome.profile.totalPlays).toBe(3);
    expect(outcome.profile.totalPairs).toBe(13);
  });

  it('persists the updated profile', () => {
    recordRun(run({ mode: 'adventure', score: 300, stage: 2, bestStreak: 5, pairs: 9 }));

    const reloaded = loadProfile();
    expect(reloaded.modes.adventure.bestStage).toBe(2);
    expect(reloaded.totalPairs).toBe(9);
    expect(reloaded.totalPlays).toBe(1);
  });

  it('ignores negative or non-finite run values', () => {
    const outcome = recordRun(run({ score: Number.NaN, stage: -3, bestStreak: -1, pairs: -8 }));

    expect(outcome.profile.modes.classic).toEqual({ bestScore: 0, bestStage: 0, bestStreak: 0, plays: 1 });
    expect(outcome.profile.totalPairs).toBe(0);
  });
});

describe('day streak', () => {
  it('starts at 1 on a first ever play', () => {
    const outcome = recordRun(run(), day('2026-03-01'));

    expect(outcome.dayStreak).toBe(1);
    expect(outcome.profile.dayStreak).toBe(1);
    expect(outcome.profile.lastPlayedDay).toBe('2026-03-01');
  });

  it('increments on the next calendar day', () => {
    recordRun(run(), day('2026-03-01'));
    recordRun(run(), day('2026-03-02'));
    const outcome = recordRun(run(), day('2026-03-03'));

    expect(outcome.dayStreak).toBe(3);
    expect(outcome.profile.lastPlayedDay).toBe('2026-03-03');
  });

  it('leaves the streak alone for repeat plays on the same day', () => {
    recordRun(run(), day('2026-03-01'));
    recordRun(run(), day('2026-03-02'));
    const outcome = recordRun(run(), new Date(2026, 2, 2, 23, 30, 0));

    expect(outcome.dayStreak).toBe(2);
  });

  it('resets to 1 after a gap of two or more days', () => {
    recordRun(run(), day('2026-03-01'));
    recordRun(run(), day('2026-03-02'));
    const outcome = recordRun(run(), day('2026-03-05'));

    expect(outcome.dayStreak).toBe(1);
  });

  it('resets to 1 if the clock appears to move backwards', () => {
    recordRun(run(), day('2026-03-10'));
    const outcome = recordRun(run(), day('2026-03-08'));

    expect(outcome.dayStreak).toBe(1);
    expect(outcome.profile.lastPlayedDay).toBe('2026-03-08');
  });

  it('crosses month and year boundaries', () => {
    recordRun(run(), day('2026-12-31'));
    const outcome = recordRun(run(), day('2027-01-01'));

    expect(outcome.dayStreak).toBe(2);
    expect(outcome.profile.lastPlayedDay).toBe('2027-01-01');
  });

  it('uses local time rather than UTC for the day key', () => {
    const lateLocal = new Date(2026, 4, 9, 23, 59, 0);
    const outcome = recordRun(run(), lateLocal);

    expect(outcome.profile.lastPlayedDay).toBe('2026-05-09');
  });
});

describe('daily challenge snapshot', () => {
  it('records the daily run for the current day', () => {
    const outcome = recordRun(run({ mode: 'daily', score: 800, stars: 2 }), day('2026-03-01'));

    expect(outcome.profile.daily).toEqual({ day: '2026-03-01', score: 800, stars: 2 });
  });

  it('keeps the best score and stars within the same day', () => {
    recordRun(run({ mode: 'daily', score: 800, stars: 3 }), day('2026-03-01'));
    const outcome = recordRun(run({ mode: 'daily', score: 950, stars: 1 }), day('2026-03-01'));

    expect(outcome.profile.daily).toEqual({ day: '2026-03-01', score: 950, stars: 3 });
  });

  it('replaces the snapshot on a new day', () => {
    recordRun(run({ mode: 'daily', score: 9000, stars: 3 }), day('2026-03-01'));
    const outcome = recordRun(run({ mode: 'daily', score: 120, stars: 1 }), day('2026-03-02'));

    expect(outcome.profile.daily).toEqual({ day: '2026-03-02', score: 120, stars: 1 });
  });

  it('is untouched by runs in other modes', () => {
    recordRun(run({ mode: 'daily', score: 500, stars: 2 }), day('2026-03-01'));
    const outcome = recordRun(run({ mode: 'classic', score: 9999 }), day('2026-03-01'));

    expect(outcome.profile.daily).toEqual({ day: '2026-03-01', score: 500, stars: 2 });
  });
});

describe('stage stars', () => {
  it('stores stars earned on an adventure stage', () => {
    const outcome = recordRun(run({ mode: 'adventure', stage: 4, stars: 2 }));

    expect(outcome.profile.stageStars).toEqual({ '4': 2 });
  });

  it('never lowers a stage rating', () => {
    recordRun(run({ mode: 'adventure', stage: 4, stars: 3 }));
    const outcome = recordRun(run({ mode: 'adventure', stage: 4, stars: 1 }));

    expect(outcome.profile.stageStars['4']).toBe(3);
  });

  it('raises a stage rating and tracks stages separately', () => {
    recordRun(run({ mode: 'adventure', stage: 4, stars: 1 }));
    recordRun(run({ mode: 'adventure', stage: 5, stars: 2 }));
    const outcome = recordRun(run({ mode: 'adventure', stage: 4, stars: 3 }));

    expect(outcome.profile.stageStars).toEqual({ '4': 3, '5': 2 });
  });

  it('clamps stars to 0..3 and ignores runs without a rating', () => {
    recordRun(run({ mode: 'adventure', stage: 6, stars: 99 }));
    const outcome = recordRun(run({ mode: 'adventure', stage: 7 }));

    expect(outcome.profile.stageStars).toEqual({ '6': 3 });
  });
});

describe('unlocks', () => {
  function stub(overrides: Partial<Profile> = {}): Profile {
    return { ...loadProfile(), ...overrides };
  }

  it('exposes a catalogue of distinct, described unlocks', () => {
    expect(UNLOCKS.length).toBeGreaterThanOrEqual(6);
    expect(UNLOCKS.length).toBeLessThanOrEqual(8);

    const ids = UNLOCKS.map((unlock) => unlock.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const unlock of UNLOCKS) {
      expect(unlock.label.length).toBeGreaterThan(0);
      expect(unlock.detail.length).toBeGreaterThan(0);
    }
  });

  it('qualifies for nothing on a brand new profile', () => {
    expect(evaluateUnlocks(loadProfile())).toEqual([]);
  });

  it('is pure: repeated calls agree and the profile is untouched', () => {
    const profile = stub({ totalPlays: 4, totalPairs: 120 });
    const snapshot = JSON.stringify(profile);

    const first = evaluateUnlocks(profile);
    const second = evaluateUnlocks(profile);

    expect(first).toEqual(second);
    expect(JSON.stringify(profile)).toBe(snapshot);
  });

  it('awards the first-run unlock after a single play', () => {
    const outcome = recordRun(run({ pairs: 3 }));

    expect(outcome.newUnlocks.map((unlock) => unlock.id)).toContain('first-clear');
    expect(isUnlocked(outcome.profile, 'first-clear')).toBe(true);
  });

  it('awards total-pairs milestones in order', () => {
    expect(evaluateUnlocks(stub({ totalPairs: 99 })).map((u) => u.id)).not.toContain('pairs-100');
    expect(evaluateUnlocks(stub({ totalPairs: 100 })).map((u) => u.id)).toContain('pairs-100');

    const veteran = evaluateUnlocks(stub({ totalPairs: 1000 })).map((u) => u.id);
    expect(veteran).toContain('pairs-100');
    expect(veteran).toContain('pairs-1000');
  });

  it('awards streak milestones from the best streak in any mode', () => {
    const profile = loadProfile();
    profile.modes.zen.bestStreak = 10;
    expect(evaluateUnlocks(profile).map((u) => u.id)).toContain('streak-10');
    expect(evaluateUnlocks(profile).map((u) => u.id)).not.toContain('streak-20');

    profile.modes.timeattack.bestStreak = 20;
    expect(evaluateUnlocks(profile).map((u) => u.id)).toContain('streak-20');
  });

  it('awards adventure depth milestones', () => {
    const profile = loadProfile();
    profile.modes.adventure.bestStage = 5;
    expect(evaluateUnlocks(profile).map((u) => u.id)).toContain('stage-5');
    expect(evaluateUnlocks(profile).map((u) => u.id)).not.toContain('stage-15');

    profile.modes.adventure.bestStage = 15;
    expect(evaluateUnlocks(profile).map((u) => u.id)).toContain('stage-15');
  });

  it('awards the three-day habit unlock', () => {
    recordRun(run(), day('2026-03-01'));
    recordRun(run(), day('2026-03-02'));
    const outcome = recordRun(run(), day('2026-03-03'));

    expect(outcome.dayStreak).toBe(3);
    expect(outcome.newUnlocks.map((unlock) => unlock.id)).toContain('days-3');
  });

  it('returns only unlocks earned by this run and never duplicates them', () => {
    const first = recordRun(run({ pairs: 120 }));
    expect(first.newUnlocks.map((unlock) => unlock.id).sort()).toEqual(['first-clear', 'pairs-100']);

    const second = recordRun(run({ pairs: 1 }));
    expect(second.newUnlocks).toEqual([]);
    expect(second.profile.unlocks.filter((id) => id === 'pairs-100')).toHaveLength(1);
  });

  it('keeps earned unlocks across reloads and reports unknown ids as locked', () => {
    recordRun(run({ pairs: 120 }));
    const reloaded = loadProfile();

    expect(isUnlocked(reloaded, 'pairs-100')).toBe(true);
    expect(isUnlocked(reloaded, 'pairs-1000')).toBe(false);
    expect(isUnlocked(reloaded, 'not-a-real-unlock')).toBe(false);
  });
});
