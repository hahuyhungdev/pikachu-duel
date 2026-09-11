import { useState } from 'react';
import { AVATARS, avatarSrc } from '../avatars';
import type { User } from '../leaderboardApi';

interface AuthModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onLogin: (username: string, pass: string) => Promise<unknown>;
  onRegister: (username: string, pass: string, avatar: string) => Promise<unknown>;
  onLogout: () => void;
}

export function AuthModal({
  isOpen,
  user,
  onClose,
  onLogin,
  onRegister,
  onLogout,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('pikachu');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setBusy(true);

    try {
      if (tab === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, password, selectedAvatar);
      }
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" data-overlay="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="panel panel--auth">
        <div className="panel__eyebrow">Pikachu Duel Cloud</div>
        <div className="auth-header">
          <h2 id="auth-title" className="auth-title">
            {user ? 'Hồ Sơ Huấn Luyện Viên' : tab === 'login' ? 'Đăng Nhập' : 'Tạo Tài Khoản Mới'}
          </h2>
          <button className="btn btn--close-corner" type="button" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        {user ? (
          <div className="auth-profile">
            <div className="auth-profile__card">
              <img
                className="auth-profile__avatar"
                src={avatarSrc(user.avatar)}
                alt={user.avatar}
              />
              <div className="auth-profile__info">
                <b className="auth-profile__name">{user.username}</b>
                <span className="auth-profile__date">
                  Tham gia: {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                </span>
                <span className="auth-profile__badge">✔ Đã liên kết máy chủ</span>
              </div>
            </div>

            <div className="panel__actions">
              <button
                className="btn btn--quiet"
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
              >
                Đăng xuất
              </button>
              <button className="btn btn--primary" type="button" onClick={onClose}>
                Tiếp tục chơi
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="auth-tabs" role="tablist">
              <button
                className={`auth-tab ${tab === 'login' ? 'auth-tab--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={tab === 'login'}
                onClick={() => {
                  setTab('login');
                  setErrorMsg(null);
                }}
              >
                Đăng nhập
              </button>
              <button
                className={`auth-tab ${tab === 'register' ? 'auth-tab--active' : ''}`}
                type="button"
                role="tab"
                aria-selected={tab === 'register'}
                onClick={() => {
                  setTab('register');
                  setErrorMsg(null);
                }}
              >
                Đăng ký tài khoản
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {errorMsg && (
                <div className="auth-error" role="alert">
                  ⚠ {errorMsg}
                </div>
              )}

              {tab === 'register' && (
                <fieldset className="avatar-picker">
                  <legend className="avatar-picker__legend">Chọn Pokémon đại diện</legend>
                  <div className="avatar-picker__grid">
                    {AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        className={`avatar-option ${selectedAvatar === av.id ? 'avatar-option--selected' : ''}`}
                        onClick={() => setSelectedAvatar(av.id)}
                        title={av.name}
                      >
                        <img src={av.src} alt={av.name} className="avatar-option__img" />
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="field">
                <label htmlFor="auth-username">Tên người chơi (Username)</label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: AshKetchum"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={2}
                  maxLength={20}
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label htmlFor="auth-password">Mật khẩu hoặc Mã PIN</label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  placeholder="Nhập ít nhất 3 ký tự"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={3}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              <div className="panel__actions">
                <button className="btn btn--primary btn--retry" type="submit" disabled={busy}>
                  {busy ? 'Đang xử lý...' : tab === 'login' ? 'Đăng nhập ngay' : 'Đăng ký ngay'}
                </button>
                <button className="btn" type="button" onClick={onClose}>
                  Bỏ qua
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
