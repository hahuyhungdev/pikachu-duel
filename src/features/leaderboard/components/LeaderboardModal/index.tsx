import { useEffect, useState } from 'react';
import { avatarSrc } from '../../avatars';
import { fetchLeaderboard, syncLocalBests, type LeaderboardEntry } from '../../leaderboardApi';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: string;
}

const MODES = [
  { id: 'adventure', label: '🌟 Adventure' },
  { id: 'timeattack', label: '⚡ Time Attack' },
  { id: 'classic', label: '🎯 Classic' },
  { id: 'daily', label: '📅 Daily' },
];

export function LeaderboardModal({ isOpen, onClose, defaultMode = 'adventure' }: LeaderboardModalProps) {
  const [activeMode, setActiveMode] = useState(defaultMode);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    queueMicrotask(() => {
      if (!ignore) setLoading(true);
    });

    // Sync any unsubmitted local records (e.g. from previous runs or offline play)
    void syncLocalBests().finally(() => {
      if (ignore) return;
      fetchLeaderboard(activeMode)
        .then((res) => {
          if (!ignore) {
            setEntries(res.entries);
            setUserEntry(res.userEntry ?? null);
          }
        })
        .finally(() => {
          if (!ignore) setLoading(false);
        });
    });

    return () => {
      ignore = true;
    };
  }, [activeMode, isOpen]);

  if (!isOpen) return null;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="overlay" data-overlay="leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="lb-title">
      <div className="panel panel--leaderboard">
        <div className="panel__eyebrow">Pikachu Duel Cloud</div>
        <div className="leaderboard-header">
          <h2 id="lb-title" className="leaderboard-title">
            🏆 Global Leaderboard
          </h2>
          <button className="btn btn--close-corner" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="leaderboard-tabs" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`leaderboard-tab ${activeMode === m.id ? 'leaderboard-tab--active' : ''}`}
              role="tab"
              aria-selected={activeMode === m.id}
              onClick={() => setActiveMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="leaderboard-loading">
            <span className="spinner" /> Loading leaderboard...
          </div>
        ) : (
          <div className="leaderboard-body">
            {/* Podium for Top 3 */}
            {top3.length > 0 && (
              <div className="podium">
                {/* 2nd place */}
                {top3[1] ? (
                  <div className="podium-col podium-col--2nd">
                    <span className="podium-badge podium-badge--silver">🥈 #2</span>
                    <img className="podium-avatar" src={avatarSrc(top3[1].avatar)} alt="" />
                    <b className="podium-name">{top3[1].username}</b>
                    <span className="podium-score">
                      {top3[1].score.toLocaleString('en-US')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Stage {top3[1].stage}</span>
                    )}
                  </div>
                ) : <div className="podium-col" />}

                {/* 1st place */}
                {top3[0] && (
                  <div className="podium-col podium-col--1st">
                    <span className="podium-badge podium-badge--gold">👑 #1</span>
                    <img className="podium-avatar" src={avatarSrc(top3[0].avatar)} alt="" />
                    <b className="podium-name">{top3[0].username}</b>
                    <span className="podium-score">
                      {top3[0].score.toLocaleString('en-US')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Stage {top3[0].stage}</span>
                    )}
                  </div>
                )}

                {/* 3rd place */}
                {top3[2] ? (
                  <div className="podium-col podium-col--3rd">
                    <span className="podium-badge podium-badge--bronze">🥉 #3</span>
                    <img className="podium-avatar" src={avatarSrc(top3[2].avatar)} alt="" />
                    <b className="podium-name">{top3[2].username}</b>
                    <span className="podium-score">
                      {top3[2].score.toLocaleString('en-US')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Stage {top3[2].stage}</span>
                    )}
                  </div>
                ) : <div className="podium-col" />}
              </div>
            )}

            {/* Rest of the table */}
            {rest.length > 0 ? (
              <div className="leaderboard-table-wrap">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th className="th-rank">Rank</th>
                      <th className="th-user">Player</th>
                      {activeMode === 'adventure' && <th className="th-stage">Stage</th>}
                      <th className="th-score">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((entry) => (
                      <tr key={entry.userId + entry.rank} className="lb-row">
                        <td className="td-rank">#{entry.rank}</td>
                        <td className="td-user">
                          <img className="lb-user-avatar" src={avatarSrc(entry.avatar)} alt="" />
                          <span className="lb-user-name">{entry.username}</span>
                        </td>
                        {activeMode === 'adventure' && (
                          <td className="td-stage">Stage {entry.stage}</td>
                        )}
                        <td className="td-score">{entry.score.toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : entries.length === 0 ? (
              <p className="leaderboard-empty">No scores recorded yet for this mode. Be the first!</p>
            ) : null}

            {/* Pinned user rank if logged in */}
            {userEntry && (
              <div className="leaderboard-sticky-user">
                <span className="sticky-user__rank">Rank #{userEntry.rank}</span>
                <img className="sticky-user__avatar" src={avatarSrc(userEntry.avatar)} alt="" />
                <span className="sticky-user__name">
                  {userEntry.username.includes('You') ? userEntry.username : `${userEntry.username} (You)`}
                </span>
                {activeMode === 'adventure' && (
                  <span className="sticky-user__stage">Stage {userEntry.stage}</span>
                )}
                <span className="sticky-user__score">{userEntry.score.toLocaleString('en-US')} pts</span>
              </div>
            )}
          </div>
        )}

        <div className="panel__actions">
          <button className="btn btn--primary" type="button" onClick={onClose}>
            Close Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
