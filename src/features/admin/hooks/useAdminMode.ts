import { useState, useEffect, useCallback } from 'react';

const ADMIN_STORAGE_KEY = 'pikachu/admin_mode';
const ADMIN_BAR_KEY = 'pikachu/admin_bar_visible';

export function getStoredAdminMode(): boolean {
  try {
    return localStorage.getItem(ADMIN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredAdminMode(enabled: boolean): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, enabled ? 'true' : 'false');
    if (enabled && localStorage.getItem(ADMIN_BAR_KEY) === null) {
      localStorage.setItem(ADMIN_BAR_KEY, 'true');
    }
  } catch {
    /* ignore */
  }
}

export function getStoredBarVisible(): boolean {
  try {
    return localStorage.getItem(ADMIN_BAR_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredBarVisible(visible: boolean): void {
  try {
    localStorage.setItem(ADMIN_BAR_KEY, visible ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const url = new URL(window.location.href);
    const hasAdminPath = url.pathname.includes('/admin');
    const hasAdminQuery = url.searchParams.has('admin');
    return hasAdminPath || hasAdminQuery || getStoredAdminMode();
  });

  const [barVisible, setBarVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const url = new URL(window.location.href);
    if (url.pathname.includes('/admin') || url.searchParams.has('admin')) return true;
    return getStoredBarVisible();
  });

  useEffect(() => {
    const checkUrl = () => {
      const url = new URL(window.location.href);
      if (url.pathname.includes('/admin') || url.searchParams.has('admin')) {
        setIsAdmin(true);
        setStoredAdminMode(true);
      }
    };
    checkUrl();
    window.addEventListener('popstate', checkUrl);
    return () => window.removeEventListener('popstate', checkUrl);
  }, []);

  const toggleAdmin = useCallback((enabled: boolean) => {
    setIsAdmin(enabled);
    setStoredAdminMode(enabled);
    if (enabled) {
      setBarVisible(true);
      setStoredBarVisible(true);
    }
  }, []);

  const toggleBar = useCallback((visible: boolean) => {
    setBarVisible(visible);
    setStoredBarVisible(visible);
  }, []);

  return {
    isAdmin,
    barVisible: isAdmin && barVisible,
    toggleAdmin,
    toggleBar,
  };
}
