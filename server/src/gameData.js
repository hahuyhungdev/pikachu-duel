/**
 * Pikachu Game Data Service.
 *
 * Runs inside a Cloudflare Durable Object with SQLite-backed storage.
 * Handles:
 * - User Registration & Login (SHA-256 password hashing + salt)
 * - Session token management
 * - Score submission & personal statistics
 * - Global Leaderboard ranking across all modes (Adventure, Time Attack, Classic, Daily)
 */

import { mergeProgress, normalizeProgress } from '../../src/shared/game/progress.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

function randomHex(length = 16) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class GameData {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql ?? null;
    this.init();
  }

  init() {
    if (this.sql) {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE COLLATE NOCASE,
          salt TEXT NOT NULL,
          passhash TEXT NOT NULL,
          avatar TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scores (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          avatar TEXT NOT NULL,
          mode TEXT NOT NULL,
          score INTEGER NOT NULL,
          stage INTEGER NOT NULL,
          streak INTEGER NOT NULL,
          pairs INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_scores_mode_score ON scores(mode, score DESC);
        CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      `);
    }
  }

  async getKvData(key, defaultValue) {
    return (await this.ctx.storage.get(key)) ?? defaultValue;
  }

  async putKvData(key, value) {
    await this.ctx.storage.put(key, value);
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'Content-Type, Authorization',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'access-control-max-age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');

    try {
      if (path === '/health') {
        return json({ ok: true, service: 'pikachu-game-data', time: Date.now() });
      }

      if (path === '/auth/register' && request.method === 'POST') {
        return await this.handleRegister(request);
      }

      if (path === '/auth/login' && request.method === 'POST') {
        return await this.handleLogin(request);
      }

      if (path === '/auth/me' && request.method === 'GET') {
        return await this.handleGetMe(request);
      }

      if (path === '/scores' && request.method === 'POST') {
        return await this.handleSubmitScore(request);
      }

      if (path === '/progress' && ['GET', 'PUT'].includes(request.method)) {
        return await this.handleProgress(request);
      }

      if (path === '/leaderboard' && request.method === 'GET') {
        return await this.handleGetLeaderboard(request, url);
      }

      return json({ error: 'not_found' }, 404);
    } catch (err) {
      console.error('GameData error:', err);
      return json({ error: 'internal_error', message: err.message }, 500);
    }
  }

  async getUserFromAuth(request) {
    const auth = request.headers.get('Authorization') ?? '';
    const tokenMatch = auth.match(/^Bearer\s+([A-Za-z0-9_-]+)$/);
    if (!tokenMatch) return null;

    const token = tokenMatch[1];
    if (this.sql) {
      const rows = Array.from(
        this.sql.exec(
          `SELECT u.id, u.username, u.avatar, u.created_at
           FROM sessions s
           JOIN users u ON s.user_id = u.id
           WHERE s.token = ?`,
          token,
        ),
      );
      return rows[0] ?? null;
    }

    const sessions = await this.getKvData('sessions', {});
    const userId = sessions[token]?.userId;
    if (!userId) return null;

    const users = await this.getKvData('users', {});
    const user = users[userId];
    if (!user) return null;

    return { id: user.id, username: user.username, avatar: user.avatar, created_at: user.created_at };
  }

  async handleProgress(request) {
    const user = await this.getUserFromAuth(request);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const key = `progress:${user.id}`;
    if (request.method === 'GET') {
      return json({ ok: true, userId: user.id, profile: normalizeProgress(await this.getKvData(key, null)) });
    }
    // Bound the streamed body even when Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'invalid_profile' }, 400);
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 32768) {
        await reader.cancel();
        return json({ error: 'payload_too_large' }, 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400); }
    if (!body?.profile || typeof body.profile !== 'object' || Array.isArray(body.profile)) {
      return json({ error: 'invalid_profile' }, 400);
    }
    const incoming = normalizeProgress(body.profile);
    const profile = await this.ctx.storage.transaction(async (txn) => {
      const merged = mergeProgress(await txn.get(key), incoming);
      await txn.put(key, merged);
      return merged;
    });
    return json({ ok: true, userId: user.id, profile });
  }

  async handleRegister(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const rawUsername = String(body.username ?? '').trim();
    const rawPassword = String(body.password ?? '').trim();
    const avatar = String(body.avatar ?? 'pikachu').trim() || 'pikachu';

    if (rawUsername.length < 2 || rawUsername.length > 20) {
      return json({ error: 'invalid_username', message: 'Tên người chơi phải từ 2 đến 20 ký tự.' }, 400);
    }

    if (rawPassword.length < 3) {
      return json({ error: 'invalid_password', message: 'Mật khẩu phải từ 3 ký tự trở lên.' }, 400);
    }

    const salt = randomHex(16);
    const passhash = await hashPassword(rawPassword, salt);
    const now = Date.now();
    const userId = `usr_${now}_${randomHex(4)}`;
    const token = `tok_${randomHex(24)}`;

    if (this.sql) {
      const existing = Array.from(this.sql.exec('SELECT id FROM users WHERE username = ? COLLATE NOCASE', rawUsername));
      if (existing.length > 0) {
        return json({ error: 'username_taken', message: 'Tên người chơi này đã có người dùng.' }, 409);
      }

      this.sql.exec(
        'INSERT INTO users (id, username, salt, passhash, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        userId,
        rawUsername,
        salt,
        passhash,
        avatar,
        now,
      );

      this.sql.exec('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, now);
    } else {
      const users = await this.getKvData('users', {});
      const taken = Object.values(users).some((u) => u.username.toLowerCase() === rawUsername.toLowerCase());
      if (taken) {
        return json({ error: 'username_taken', message: 'Tên người chơi này đã có người dùng.' }, 409);
      }

      users[userId] = { id: userId, username: rawUsername, salt, passhash, avatar, created_at: now };
      await this.putKvData('users', users);

      const sessions = await this.getKvData('sessions', {});
      sessions[token] = { userId, createdAt: now };
      await this.putKvData('sessions', sessions);
    }

    return json(
      {
        ok: true,
        token,
        user: { id: userId, username: rawUsername, avatar, createdAt: now },
      },
      201,
    );
  }

  async handleLogin(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const rawUsername = String(body.username ?? '').trim();
    const rawPassword = String(body.password ?? '').trim();

    let user;
    if (this.sql) {
      const rows = Array.from(this.sql.exec('SELECT * FROM users WHERE username = ? COLLATE NOCASE', rawUsername));
      user = rows[0] ?? null;
    } else {
      const users = await this.getKvData('users', {});
      user = Object.values(users).find((u) => u.username.toLowerCase() === rawUsername.toLowerCase()) ?? null;
    }

    if (!user) {
      return json({ error: 'invalid_credentials', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
    }

    const testHash = await hashPassword(rawPassword, user.salt);
    if (testHash !== user.passhash) {
      return json({ error: 'invalid_credentials', message: 'Tên đăng nhập hoặc mật khẩu không đúng.' }, 401);
    }

    const token = `tok_${randomHex(24)}`;
    const now = Date.now();

    if (this.sql) {
      this.sql.exec('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, user.id, now);
    } else {
      const sessions = await this.getKvData('sessions', {});
      sessions[token] = { userId: user.id, createdAt: now };
      await this.putKvData('sessions', sessions);
    }

    return json({
      ok: true,
      token,
      user: { id: user.id, username: user.username, avatar: user.avatar, createdAt: user.created_at },
    });
  }

  async handleGetMe(request) {
    const user = await this.getUserFromAuth(request);
    if (!user) return json({ error: 'unauthorized' }, 401);

    let stats = { totalPlays: 0, bestScore: 0, bestStage: 0, modes: {} };

    if (this.sql) {
      const playRows = Array.from(this.sql.exec('SELECT COUNT(*) as count FROM scores WHERE user_id = ?', user.id));
      stats.totalPlays = playRows[0]?.count ?? 0;

      const modeRows = Array.from(
        this.sql.exec(
          'SELECT mode, MAX(score) as best_score, MAX(stage) as best_stage FROM scores WHERE user_id = ? GROUP BY mode',
          user.id,
        ),
      );
      for (const row of modeRows) {
        stats.modes[row.mode] = { bestScore: row.best_score ?? 0, bestStage: row.best_stage ?? 0 };
        if ((row.best_score ?? 0) > stats.bestScore) stats.bestScore = row.best_score;
        if ((row.best_stage ?? 0) > stats.bestStage) stats.bestStage = row.best_stage;
      }
    } else {
      const allScores = await this.getKvData('scores', []);
      const userScores = allScores.filter((s) => s.user_id === user.id);
      stats.totalPlays = userScores.length;
      for (const s of userScores) {
        if (!stats.modes[s.mode]) stats.modes[s.mode] = { bestScore: 0, bestStage: 0 };
        if (s.score > stats.modes[s.mode].bestScore) stats.modes[s.mode].bestScore = s.score;
        if (s.stage > stats.modes[s.mode].bestStage) stats.modes[s.mode].bestStage = s.stage;
        if (s.score > stats.bestScore) stats.bestScore = s.score;
        if (s.stage > stats.bestStage) stats.bestStage = s.stage;
      }
    }

    return json({ ok: true, user, stats });
  }

  async handleSubmitScore(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const user = await this.getUserFromAuth(request);
    const mode = String(body.mode ?? 'adventure');
    const score = Math.max(0, Math.trunc(Number(body.score) || 0));
    const stage = Math.max(1, Math.trunc(Number(body.stage) || 1));
    const streak = Math.max(0, Math.trunc(Number(body.streak) || 0));
    const pairs = Math.max(0, Math.trunc(Number(body.pairs) || 0));

    let userId;
    let username;
    let avatar;

    if (user) {
      userId = user.id;
      username = user.username;
      avatar = user.avatar;
    } else {
      userId = `guest_${randomHex(8)}`;
      username = String(body.guestName ?? 'Khách').trim().slice(0, 20) || 'Khách';
      avatar = String(body.guestAvatar ?? 'pikachu').trim() || 'pikachu';
    }

    const scoreId = `scr_${Date.now()}_${randomHex(4)}`;
    const now = Date.now();

    let rank;

    if (this.sql) {
      this.sql.exec(
        `INSERT INTO scores (id, user_id, username, avatar, mode, score, stage, streak, pairs, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        scoreId,
        userId,
        username,
        avatar,
        mode,
        score,
        stage,
        streak,
        pairs,
        now,
      );

      // Compute rank among unique users in this mode
      if (mode === 'adventure') {
        const rankRows = Array.from(
          this.sql.exec(
            `SELECT COUNT(DISTINCT user_id) as count
             FROM scores
             WHERE mode = ? AND (stage > ? OR (stage = ? AND score > ?))`,
            mode,
            stage,
            stage,
            score,
          ),
        );
        rank = (rankRows[0]?.count ?? 0) + 1;
      } else {
        const rankRows = Array.from(
          this.sql.exec(
            `SELECT COUNT(DISTINCT user_id) as count
             FROM scores
             WHERE mode = ? AND score > ?`,
            mode,
            score,
          ),
        );
        rank = (rankRows[0]?.count ?? 0) + 1;
      }
    } else {
      const allScores = await this.getKvData('scores', []);
      allScores.push({
        id: scoreId,
        user_id: userId,
        username,
        avatar,
        mode,
        score,
        stage,
        streak,
        pairs,
        created_at: now,
      });
      await this.putKvData('scores', allScores);

      const modeScores = allScores.filter((s) => s.mode === mode);
      const userBests = new Map();
      for (const s of modeScores) {
        const cur = userBests.get(s.user_id);
        if (!cur || (mode === 'adventure' ? (s.stage > cur.stage || (s.stage === cur.stage && s.score > cur.score)) : s.score > cur.score)) {
          userBests.set(s.user_id, s);
        }
      }
      const sorted = [...userBests.values()].sort((a, b) => {
        if (mode === 'adventure' && b.stage !== a.stage) return b.stage - a.stage;
        return b.score - a.score;
      });
      const idx = sorted.findIndex((s) => s.user_id === userId);
      rank = idx >= 0 ? idx + 1 : sorted.length + 1;
    }

    return json({
      ok: true,
      rank,
      score,
      stage,
      mode,
    });
  }

  async handleGetLeaderboard(request, url) {
    const mode = url.searchParams.get('mode') ?? 'adventure';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const user = await this.getUserFromAuth(request);

    let entries;
    let userEntry = null;

    if (this.sql) {
      if (mode === 'adventure') {
        entries = Array.from(
          this.sql.exec(
            `SELECT user_id, username, avatar, mode, MAX(score) as score, MAX(stage) as stage, MAX(streak) as streak, MAX(created_at) as created_at
             FROM scores
             WHERE mode = ?
             GROUP BY user_id, username, avatar
             ORDER BY stage DESC, score DESC
             LIMIT ?`,
            mode,
            limit,
          ),
        );
      } else {
        entries = Array.from(
          this.sql.exec(
            `SELECT user_id, username, avatar, mode, MAX(score) as score, MAX(stage) as stage, MAX(streak) as streak, MAX(created_at) as created_at
             FROM scores
             WHERE mode = ?
             GROUP BY user_id, username, avatar
             ORDER BY score DESC
             LIMIT ?`,
            mode,
            limit,
          ),
        );
      }

      entries = entries.map((item, index) => ({
        rank: index + 1,
        userId: item.user_id,
        username: item.username,
        avatar: item.avatar,
        score: item.score,
        stage: item.stage,
        streak: item.streak,
        createdAt: item.created_at,
      }));

      if (user) {
        const found = entries.find((e) => e.userId === user.id);
        if (found) {
          userEntry = found;
        } else {
          // Calculate user's rank outside the limit
          const userBestRows = Array.from(
            this.sql.exec(
              `SELECT MAX(score) as score, MAX(stage) as stage, MAX(streak) as streak
               FROM scores
               WHERE mode = ? AND user_id = ?`,
              mode,
              user.id,
            ),
          );
          if (userBestRows.length > 0 && userBestRows[0].score !== null) {
            const uScore = userBestRows[0].score;
            const uStage = userBestRows[0].stage;
            let count;
            if (mode === 'adventure') {
              const r = Array.from(
                this.sql.exec(
                  `SELECT COUNT(DISTINCT user_id) as count
                   FROM scores
                   WHERE mode = ? AND (stage > ? OR (stage = ? AND score > ?))`,
                  mode,
                  uStage,
                  uStage,
                  uScore,
                ),
              );
              count = r[0]?.count ?? 0;
            } else {
              const r = Array.from(
                this.sql.exec('SELECT COUNT(DISTINCT user_id) as count FROM scores WHERE mode = ? AND score > ?', mode, uScore),
              );
              count = r[0]?.count ?? 0;
            }
            userEntry = {
              rank: count + 1,
              userId: user.id,
              username: user.username,
              avatar: user.avatar,
              score: uScore,
              stage: uStage,
              streak: userBestRows[0].streak ?? 0,
            };
          }
        }
      }
    } else {
      const allScores = await this.getKvData('scores', []);
      const modeScores = allScores.filter((s) => s.mode === mode);
      const userBests = new Map();
      for (const s of modeScores) {
        const cur = userBests.get(s.user_id);
        if (!cur || (mode === 'adventure' ? (s.stage > cur.stage || (s.stage === cur.stage && s.score > cur.score)) : s.score > cur.score)) {
          userBests.set(s.user_id, s);
        }
      }
      const sorted = [...userBests.values()].sort((a, b) => {
        if (mode === 'adventure' && b.stage !== a.stage) return b.stage - a.stage;
        return b.score - a.score;
      });

      entries = sorted.slice(0, limit).map((item, index) => ({
        rank: index + 1,
        userId: item.user_id,
        username: item.username,
        avatar: item.avatar,
        score: item.score,
        stage: item.stage,
        streak: item.streak,
        createdAt: item.created_at,
      }));

      if (user) {
        const idx = sorted.findIndex((s) => s.user_id === user.id);
        if (idx >= 0) {
          const item = sorted[idx];
          userEntry = {
            rank: idx + 1,
            userId: item.user_id,
            username: item.username,
            avatar: item.avatar,
            score: item.score,
            stage: item.stage,
            streak: item.streak,
            createdAt: item.created_at,
          };
        }
      }
    }

    return json({
      ok: true,
      mode,
      entries,
      userEntry,
    });
  }
}
