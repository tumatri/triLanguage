import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '../../lib/api';

interface Notebook {
  id: string;
  name: string;
  language_variant: 'zh-Hant' | 'zh-Hans' | 'en-US';
  timezone: string;
  created_at: string;
  updated_at: string;
}

export default function NotebooksPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLang, setNewLang] = useState<'zh-Hant' | 'zh-Hans' | 'en-US'>('zh-Hant');

  const { data, isLoading } = useQuery({
    queryKey: ['notebooks'],
    queryFn: () => ApiClient.get<{ notebooks: Notebook[] }>('/notebooks')
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; language_variant: string }) =>
      ApiClient.post<{ notebook: Notebook }>('/notebooks', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
      setShowCreate(false);
      setNewName('');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      ApiClient.delete<{ message: string }>(`/notebooks/${id}?confirm=${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebooks'] });
    }
  });

  const notebooks = data?.notebooks ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), language_variant: newLang });
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Bạn có chắc muốn xóa sổ "${name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }
    deleteMutation.mutate(id);
  }

  if (isLoading) {
    return <div className="text-center py-8">Đang tải...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Sổ tay từ vựng</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
        >
          {showCreate ? 'Hủy' : '+ Tạo sổ mới'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tên sổ</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
              placeholder="VD: Tiếng Trung Đài Loan"
              maxLength={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Biến thể ngôn ngữ</label>
            <select
              value={newLang}
              onChange={(e) => setNewLang(e.target.value as 'zh-Hant' | 'zh-Hans' | 'en-US')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
            >
              <option value="zh-Hant">Tiếng Trung Phồn thể (zh-Hant)</option>
              <option value="zh-Hans">Tiếng Trung Giản thể (zh-Hans)</option>
              <option value="en-US">Tiếng Anh Mỹ (en-US)</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending || !newName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo sổ'}
          </button>
        </form>
      )}

      {notebooks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">Chưa có sổ nào. Hãy tạo sổ đầu tiên để bắt đầu học.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((nb) => (
            <div key={nb.id} className="bg-white p-6 rounded-lg shadow space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">{nb.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {nb.language_variant === 'zh-Hant' && '🇹🇼 Tiếng Trung Phồn thể'}
                  {nb.language_variant === 'zh-Hans' && '🇨🇳 Tiếng Trung Giản thể'}
                  {nb.language_variant === 'en-US' && '🇺🇸 Tiếng Anh Mỹ'}
                </p>
              </div>
              <div className="text-xs text-gray-400">
                Tạo: {new Date(nb.created_at).toLocaleDateString('vi-VN')}
              </div>
              <div className="flex gap-2">
                <a
                  href={`/notebooks/${nb.id}`}
                  className="flex-1 text-center px-3 py-2 bg-blue-50 text-blue-700 rounded text-sm hover:bg-blue-100"
                >
                  Mở
                </a>
                <button
                  onClick={() => handleDelete(nb.id, nb.name)}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-2 bg-red-50 text-red-700 rounded text-sm hover:bg-red-100 disabled:opacity-50"
                >
                  Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
