import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import Layout from './components/Layout';
import LoginPage from './features/auth/LoginPage';
import BootstrapPage from './features/auth/BootstrapPage';
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

/** Show login or bootstrap depending on whether any owner exists */
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

  // Not authenticated — decide which page to show
  return <LoginPageGate />;
}

function LoginPageGate() {
  const [mode, setMode] = useState<'bootstrap' | 'login' | 'checking'>('checking');

  useEffect(() => {
    fetch('/api/auth/bootstrap')
      .then(r => r.json())
      .then(data => setMode(data.can_bootstrap ? 'bootstrap' : 'login'))
      .catch(() => setMode('login'));
  }, []);

  if (mode === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Đang tải...</p>
      </div>
    );
  }

  if (mode === 'bootstrap') {
    return <BootstrapPage onBootstrapped={() => window.location.href = '/dashboard'} />;
  }

  return <LoginPage onLogin={() => window.location.href = '/dashboard'} />;
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
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notebooks"
            element={
              <ProtectedRoute>
                <NotebooksPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
