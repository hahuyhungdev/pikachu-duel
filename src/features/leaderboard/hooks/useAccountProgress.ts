import { useCallback, useEffect, useState } from 'react';
import { loadProfile, normalizeProfile, profileStorageKey, saveProfile, subscribeProfile, type Profile } from '../../../shared/game/profile';
import { mergeProgress } from '../../../shared/game/progress.js';
import { fetchAccountProgress, getStoredToken, putAccountProgress, type User } from '../leaderboardApi';

export type ProgressSyncStatus = 'local' | 'syncing' | 'synced' | 'error';
type Snapshot = { userId: string | null; profile: Profile; status: ProgressSyncStatus };

function merge(a: Profile, b: unknown): Profile {
  return normalizeProfile(mergeProgress(a, b));
}

export function useAccountProgress(user: User | null) {
  const userId = user?.id ?? null;
  const token = userId ? getStoredToken() : null;
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    userId, profile: loadProfile(userId), status: userId ? 'syncing' : 'local',
  }));
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    let syncing = false;
    let revision = 0;
    let latest = loadProfile(userId);
    let request: AbortController | null = null;
    const isCurrent = () => active && (!userId || getStoredToken() === token);
    const publish = (status: ProgressSyncStatus) => {
      if (isCurrent()) setSnapshot({ userId, profile: latest, status });
    };
    const sync = async () => {
      if (!isCurrent() || syncing || !userId) return;
      if (!token) { publish('error'); return; }
      syncing = true;
      publish('syncing');
      request = new AbortController();
      const signal = request.signal;
      const timeout = setTimeout(() => request?.abort(), 10000);
      try {
        const remote = await fetchAccountProgress(token, signal);
        if (!isCurrent()) return;
        if (remote.userId !== userId) throw new Error('Account changed');
        latest = merge(latest, remote.profile);
        saveProfile(latest, userId, false);
        publish('syncing');
        do {
          const sentRevision = revision;
          const saved = await putAccountProgress(latest, token, signal);
          if (!isCurrent()) return;
          if (saved.userId !== userId) throw new Error('Account changed');
          latest = merge(latest, saved.profile);
          saveProfile(latest, userId, false);
          if (sentRevision === revision) break;
        } while (isCurrent());
        publish('synced');
      } catch {
        publish('error');
      } finally {
        clearTimeout(timeout);
        syncing = false;
      }
    };
    const changed = (profile: Profile, owner: string | null) => {
      if (owner !== userId || !isCurrent()) return;
      latest = profile;
      revision += 1;
      publish(userId ? 'syncing' : 'local');
      void sync();
    };
    const unsubscribe = subscribeProfile(changed);
    const storageChanged = (event: StorageEvent) => {
      if (event.key === profileStorageKey(userId)) changed(loadProfile(userId), userId);
    };
    const online = () => { void sync(); };
    window.addEventListener('storage', storageChanged);
    window.addEventListener('online', online);
    queueMicrotask(() => {
      if (!isCurrent()) return;
      publish(userId ? 'syncing' : 'local');
      void sync();
    });
    return () => {
      active = false;
      request?.abort();
      unsubscribe();
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('online', online);
    };
  }, [userId, token, attempt]);

  // A render during login/logout must never expose the preceding account's records.
  const current = snapshot.userId === userId ? snapshot : {
    profile: loadProfile(userId), status: userId ? 'syncing' as const : 'local' as const,
  };
  return { profile: current.profile, status: current.status, retry };
}
