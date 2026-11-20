import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Layout from './components/Layout';
import AuthPage from './features/auth/AuthPage';
import DashboardPage from './features/notebooks/DashboardPage';
import NotebooksPage from './features/notebooks/NotebooksPage';
import SettingsPage from './features/settings/SettingsPage';
import { useAuth } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5
    }
  }
});

/** Decide which auth page to show based on whether an owner exists */
function AuthGate() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Đang kiểm tra phiên...</p>
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AuthModeGate />;
}

function AuthModeGate() {
  const [mode, setMode] = useState<'bootstrap' | 'login'>('login');
  const { refresh } = useAuth();

  useEffect(() => {
    fetch('/api/auth/bootstrap')
      .then(r => r.json())
      .then(data => setMode(data.can_bootstrap ? 'bootstrap' : 'login'))
      .catch(() => setMode('login'));
  }, []);

  return (
    <AuthPage
      canBootstrap={mode === 'bootstrap'}
      onAuth={() => refresh().then(() => { window.location.href = '/dashboard'; })}
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthGate />} />
          <Route path="/login" element={<AuthGate />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout><DashboardPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/notebooks"
            element={
              <ProtectedRoute>
                <Layout><NotebooksPage /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout><SettingsPage /></Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Đang kiểm tra phiên...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
