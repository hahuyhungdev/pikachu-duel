import { useEffect, useState } from 'react';
import { avatarSrc } from '../avatars';
import { fetchLeaderboard, type LeaderboardEntry } from '../leaderboardApi';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: string;
}

const MODES = [
  { id: 'adventure', label: '🌟 Thám hiểm' },
  { id: 'timeattack', label: '⚡ Tốc độ' },
  { id: 'classic', label: '🎯 Cổ điển' },
  { id: 'daily', label: '📅 Thử thách ngày' },
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
            🏆 Bảng Xếp Hạng Toàn Cầu
          </h2>
          <button className="btn btn--close-corner" type="button" onClick={onClose} aria-label="Đóng">
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
            <span className="spinner" /> Đang tải bảng xếp hạng...
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
                      {top3[1].score.toLocaleString('vi-VN')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Màn {top3[1].stage}</span>
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
                      {top3[0].score.toLocaleString('vi-VN')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Màn {top3[0].stage}</span>
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
                      {top3[2].score.toLocaleString('vi-VN')} pts
                    </span>
                    {activeMode === 'adventure' && (
                      <span className="podium-stage">Màn {top3[2].stage}</span>
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
                      <th className="th-rank">Hạng</th>
                      <th className="th-user">Người chơi</th>
                      {activeMode === 'adventure' && <th className="th-stage">Màn</th>}
                      <th className="th-score">Điểm số</th>
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
                          <td className="td-stage">Màn {entry.stage}</td>
                        )}
                        <td className="td-score">{entry.score.toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : entries.length === 0 ? (
              <p className="leaderboard-empty">Chưa có ai ghi điểm ở chế độ này. Hãy là người đầu tiên!</p>
            ) : null}

            {/* Pinned user rank if logged in */}
            {userEntry && (
              <div className="leaderboard-sticky-user">
                <span className="sticky-user__rank">Hạng #{userEntry.rank}</span>
                <img className="sticky-user__avatar" src={avatarSrc(userEntry.avatar)} alt="" />
                <span className="sticky-user__name">{userEntry.username} (Bạn)</span>
                {activeMode === 'adventure' && (
                  <span className="sticky-user__stage">Màn {userEntry.stage}</span>
                )}
                <span className="sticky-user__score">{userEntry.score.toLocaleString('vi-VN')} pts</span>
              </div>
            )}
          </div>
        )}

        <div className="panel__actions">
          <button className="btn btn--primary" type="button" onClick={onClose}>
            Đóng bảng xếp hạng
          </button>
        </div>
      </div>
    </div>
  );
}
