import { useState } from 'react';
import { ApiClient } from '../../lib/api';

type Tab = 'login' | 'register';

interface Props {
  canBootstrap?: boolean;
}

export default function AuthPage({ canBootstrap = false }: Props) {
  const [tab, setTab] = useState<Tab>(canBootstrap ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (tab === 'register') {
      if (password !== confirmPassword) {
        setError('Mật khẩu xác nhận không khớp');
        return;
      }
      if (password.length < 8) {
        setError('Mật khẩu phải có ít nhất 8 ký tự');
        return;
      }
    }

    setLoading(true);
    try {
      await ApiClient.post('/auth/bootstrap', { email, password });
      // Hard redirect — bypasses any router issues, ensures fresh auth state load
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || (tab === 'login' ? 'Đăng nhập thất bại' : 'Không thể tạo tài khoản'));
      } else {
        setError('Đã xảy ra lỗi');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">triLanguage</h1>
          <p className="mt-2 text-gray-600">
            {tab === 'login' ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              tab === 'login'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
              tab === 'register'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Đăng ký
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-lg shadow">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                placeholder="email@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                placeholder="Ít nhất 8 ký tự"
              />
            </div>

            {tab === 'register' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Xác nhận mật khẩu
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                  placeholder="Nhập lại mật khẩu"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading
              ? (tab === 'login' ? 'Đang đăng nhập...' : 'Đang tạo...')
              : (tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản')}
          </button>

          <p className="text-center text-xs text-gray-400">
            {tab === 'login' ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
            <button
              type="button"
              onClick={() => { setTab(tab === 'login' ? 'register' : 'login'); setError(null); }}
              className="text-blue-600 hover:underline"
            >
              {tab === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
