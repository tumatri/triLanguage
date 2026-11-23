import { useState, useEffect, useCallback } from 'react';

interface SessionState {
  authenticated: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<SessionState>({ authenticated: false, loading: true });

  async function checkSession(): Promise<void> {
    try {
      // credentials: 'include' ensures the session_token cookie is sent
      const res = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await res.json();
      // Handle both {authenticated: bool} and {error: string} responses
      const authenticated = data?.authenticated ?? false;
      setState({ authenticated, loading: false });
    } catch {
      setState({ authenticated: false, loading: false });
    }
  }

  useEffect(() => {
    checkSession();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    setState({ authenticated: false, loading: false });
    window.location.href = '/login';
  }, []);

  return { ...state, logout, refresh: checkSession };
}
