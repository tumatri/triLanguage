import type { ReactNode } from 'react';
import QuotaWarningBanner from './QuotaWarningBanner';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50" role="document">
      <header className="bg-white shadow" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">triLanguage</h1>
          <nav className="flex items-center gap-4" aria-label="Điều hướng chính">
            <a href="/notebooks" className="text-gray-600 hover:text-gray-900 text-sm">Sổ tay</a>
            <a href="/settings" className="text-gray-600 hover:text-gray-900 text-sm">Cài đặt AI</a>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900 text-sm px-3 py-1 rounded border border-gray-300"
              aria-label="Đăng xuất"
            >
              Đăng xuất
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main">
        <QuotaWarningBanner />
        {children}
      </main>
    </div>
  );
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Ignore logout errors
  }
  window.location.href = '/login';
}
