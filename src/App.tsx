import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import Layout from './components/Layout';
import LoginPage from './features/auth/LoginPage';
import BootstrapPage from './features/auth/BootstrapPage';
import DashboardPage from './features/notebooks/DashboardPage';
import NotebooksPage from './features/notebooks/NotebooksPage';
import SettingsPage from './features/settings/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5
    }
  }
});

function App() {
  const [authed, setAuthed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/login" element={<LoginPage onLogin={() => setAuthed(true)} />} />
            <Route path="/bootstrap" element={<BootstrapPage onBootstrapped={() => setAuthed(true)} />} />
            <Route path="/" element={
              authed 
                ? <Navigate to="/dashboard" replace /> 
                : <Navigate to="/login" replace />
            } />
            <Route path="/dashboard" element={
              authed ? <DashboardPage /> : <Navigate to="/login" replace />
            } />
            <Route path="/notebooks" element={
              authed ? <NotebooksPage /> : <Navigate to="/login" replace />
            } />
            <Route path="/settings" element={
              authed ? <SettingsPage /> : <Navigate to="/login" replace />
            } />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
