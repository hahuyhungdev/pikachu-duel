import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearStoredAuth,
  fetchMe,
  getStoredUser,
  login as apiLogin,
  register as apiRegister,
  type User,
} from '../leaderboardApi';

export function useAuth() {
  const revision = useRef(0);
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const started = revision.current;
    fetchMe().then((res) => {
      if (active && started === revision.current && res?.user) setUser(res.user);
    });
    return () => { active = false; };
  }, []);

  const login = useCallback(async (username: string, pass: string) => {
    const started = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(username, pass);
      if (started !== revision.current) return null;
      setUser(res.user);
      return res.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      if (started === revision.current) setError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      if (started === revision.current) setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, pass: string, avatar: string) => {
    const started = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRegister(username, pass, avatar);
      if (started !== revision.current) return null;
      setUser(res.user);
      return res.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng ký thất bại';
      if (started === revision.current) setError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      if (started === revision.current) setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    revision.current += 1;
    clearStoredAuth();
    setUser(null);
    setLoading(false);
    setError(null);
  }, []);

  return {
    user,
    isLoggedIn: user !== null,
    loading,
    error,
    login,
    register,
    logout,
  };
}
