export interface Env {
  AGNES_API_KEY: string;
  AGNES_BASE_URL: string;
  AGNES_MODEL_FAST: string;
  AGNES_MODEL_REASONING: string;
  AGNES_TIMEOUT_MS: string;
  AGNES_MAX_RPM: string;
  APP_ORIGIN: string;
  SESSION_TTL_SECONDS: string;
  SESSION_SECRET: string;
  // Supabase
  DATABASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  expiresAt: number;
}
