/**
 * AI Config manager — reads/writes Agnes config from localStorage.
 * Used by the frontend API client to override server env vars at runtime.
 */

export interface AgnesRuntimeConfig {
  api_key: string;
  base_url: string;
  model_fast: string;
  timeout_ms: number;
  max_rpm: number;
}

const STORAGE_KEY = 'triLanguage_agnes_config';

export function loadAgnesConfig(): AgnesRuntimeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as Partial<AgnesRuntimeConfig>;
    if (!cfg.api_key) return null;
    return {
      api_key: cfg.api_key,
      base_url: cfg.base_url || 'https://apihub.agnes-ai.com/v1',
      model_fast: cfg.model_fast || 'agnes-2.5-flash',
      timeout_ms: cfg.timeout_ms || 45000,
      max_rpm: cfg.max_rpm || 12
    };
  } catch {
    return null;
  }
}

export function saveAgnesConfig(cfg: AgnesRuntimeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearAgnesConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Returns the active API key: localStorage config takes priority over server env.
 */
export function getActiveApiKey(): string | null {
  const cfg = loadAgnesConfig();
  return cfg?.api_key ?? null;
}
