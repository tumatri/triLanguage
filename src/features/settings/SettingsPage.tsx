import { useState, useEffect } from 'react';
import { ApiClient } from '../../lib/api';

function generateCsrfToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

interface AgnesConfig {
  base_url: string;
  model_fast: string;
  timeout_ms: number;
  max_rpm: number;
  key_present: boolean;
  key_masked: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AgnesConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    api_key: '',
    base_url: 'https://apihub.agnes-ai.com/v1',
    model_fast: 'agnes-2.5-flash',
    timeout_ms: 45000,
    max_rpm: 12
  });
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ApiClient.get<AgnesConfig>('/settings/agnes')
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      // Use raw fetch for PATCH (ApiClient doesn't expose patch)
      await fetch('/api/settings/agnes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': generateCsrfToken() },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      saveToLocalStorage(form);
      window.location.reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Lỗi: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTestResult(null);
    try {
      const resp = await fetch('/api/settings/agnes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form)
      });
      const data = await resp.json() as { success?: boolean; message?: string; error?: string };
      setTestResult({ ok: !!data.success, msg: data.message ?? data.error ?? `HTTP ${resp.status}` });
    } catch (err) {
      setTestResult({ ok: false, msg: `Lỗi kết nối: ${err}` });
    }
  }

  function saveToLocalStorage(cfg: typeof form) {
    localStorage.setItem('triLanguage_ag nes_config', JSON.stringify(cfg));
    window.location.reload(); // reload to pick up new config
  }

  function loadFromLocalStorage() {
    const raw = localStorage.getItem('triLanguage_agnes_config');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setForm(parsed);
        return true;
      } catch { /* ignore parse errors */ }
    }
    return false;
  }

  if (loading) return <div className="text-center py-8">Đang tải...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Cài đặt AI</h2>

      {/* Current config status */}
      {config && (
        <div className="bg-white p-6 rounded-lg shadow space-y-3">
          <h3 className="font-semibold text-gray-700">Trạng thái hiện tại</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Model:</span> {config.model_fast}
            </div>
            <div>
              <span className="text-gray-500">Base URL:</span> {config.base_url}
            </div>
            <div>
              <span className="text-gray-500">API Key:</span>{' '}
              {config.key_present ? `✅ Đã cấu hình (${config.key_masked})` : '⚠️ Chưa cấu hình'}
            </div>
            <div>
              <span className="text-gray-500">Timeout:</span> {config.timeout_ms}ms
            </div>
          </div>
        </div>
      )}

      {/* Manual config form */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="font-semibold text-gray-700 mb-4">Nhập cấu hình Agnes AI mới</h3>
        <p className="text-sm text-gray-500 mb-4">
          Khi credit hết hạn, bạn có thể đổi API key ngay tại đây mà không cần deploy lại.
          Cấu hình được lưu vào trình duyệt (localStorage).
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">API Key</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Base URL</label>
            <input
              type="url"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Model FAST</label>
            <input
              type="text"
              value={form.model_fast}
              onChange={(e) => setForm({ ...form, model_fast: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Timeout (ms)</label>
              <input
                type="number"
                value={form.timeout_ms}
                onChange={(e) => setForm({ ...form, timeout_ms: parseInt(e.target.value) || 45000 })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                min={5000}
                max={120000}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Max RPM</label>
              <input
                type="number"
                value={form.max_rpm}
                onChange={(e) => setForm({ ...form, max_rpm: parseInt(e.target.value) || 12 })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                min={1}
                max={100}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.api_key}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {saving ? 'Đang lưu...' : 'Lưu & tải lại'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
            >
              Kiểm tra kết nối
            </button>
            <button
              type="button"
              onClick={() => { if (loadFromLocalStorage()) alert('Đã khôi phục từ localStorage'); }}
              className="px-4 py-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 text-sm ml-auto"
            >
              Khôi phục từ browser
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.ok ? `✅ ${testResult.msg}` : `❌ ${testResult.msg}`}
            </div>
          )}
        </form>
      </div>

      {/* How it works */}
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm text-yellow-800">
        <p className="font-medium mb-1">Cách hoạt động:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Nhập API key mới → bấm "Kiểm tra kết nối" để xác nhận key hoạt động</li>
          <li>Bấm "Lưu & tải lại" — cấu hình được lưu vào localStorage của trình duyệt</li>
          <li>Trang web sẽ tải lại và tự động dùng config mới cho mọi yêu cầu AI</li>
          <li>Khi credit cũ hết hạn, chỉ cần quay lại trang này để đổi key — không cần deploy</li>
        </ol>
        <p className="mt-2 text-xs text-yellow-600">
          ⚠️ Dữ liệu cấu hình chỉ lưu cục bộ trên thiết bị này. Không đồng bộ giữa các máy.
        </p>
      </div>
    </div>
  );
}
