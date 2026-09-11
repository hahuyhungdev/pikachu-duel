import { useCallback, useEffect, useState } from 'react';
import {
  clearStoredAuth,
  fetchMe,
  getStoredUser,
  login as apiLogin,
  register as apiRegister,
  type User,
} from '../leaderboardApi';

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then((res) => {
      if (res?.user) setUser(res.user);
    });
  }, []);

  const login = useCallback(async (username: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(username, pass);
      setUser(res.user);
      return res.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập thất bại';
      setError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, pass: string, avatar: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRegister(username, pass, avatar);
      setUser(res.user);
      return res.user;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng ký thất bại';
      setError(msg);
      throw new Error(msg, { cause: err });
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setUser(null);
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
