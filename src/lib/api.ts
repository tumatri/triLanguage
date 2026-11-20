export class ApiError extends Error {
  constructor(public error: string, public details?: unknown) {
    super(error);
    this.name = 'ApiError';
  }
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api`
  : '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookieHeader = typeof document !== 'undefined' ? document.cookie : '';
  const token = parseCookie(cookieHeader, 'session_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Cookie'] = `session_token=${token}`;
  }

  if (options.method && ['POST', 'PUT', 'DELETE'].includes(options.method.toUpperCase())) {
    headers['X-CSRF-Token'] = generateCsrfToken();
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let data: { error?: string; details?: unknown } = {};
    try {
      data = await response.json();
    } catch { /* ignore */ }
    throw new ApiError(data.error || `HTTP ${response.status}`, data.details);
  }

  return response.json() as Promise<T>;
}

function parseCookie(cookieHeader: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = cookieHeader.match(new RegExp('(?:^|;)\\s*' + escapedName + '\\s*=\\s*([^;]*)'));
  return matches ? decodeURIComponent(matches[1]) : undefined;
}

function generateCsrfToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export const ApiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  }
};
