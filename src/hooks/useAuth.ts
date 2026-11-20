import { useState, useEffect, useCallback } from 'react';

interface SessionState {
  authenticated: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<SessionState>({ authenticated: false, loading: true });

  async function checkSession(): Promise<void> {
    try {
      const res = await fetch('/api/auth/check');
      const data = await res.json();
      setState({ authenticated: !!data.authenticated, loading: false });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    setState({ authenticated: false, loading: false });
    window.location.href = '/login';
  }, []);

  return { ...state, logout, refresh: checkSession };
}
