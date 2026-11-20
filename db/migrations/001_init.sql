-- Migration 001: init database schema for PostgreSQL (Supabase)
-- Runs on: psql or via supabase cli

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_owner INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language_variant TEXT NOT NULL CHECK(language_variant IN ('zh-Hant', 'zh-Hans', 'en-US')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON notebooks (user_id);
CREATE INDEX IF NOT EXISTS idx_notebooks_deleted ON notebooks (deleted_at);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL DEFAULT 'vocab',
  knowledge_type TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'ai', 'import')),
  front_text TEXT NOT NULL,
  fields_json TEXT,
  duplicate_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  UNIQUE(notebook_id, duplicate_hash)
);
CREATE INDEX IF NOT EXISTS idx_cards_notebook_id ON cards (notebook_id);
CREATE INDEX IF NOT EXISTS idx_cards_duplicate_hash ON cards (duplicate_hash);

-- media: blob_data BLOB → blob_url TEXT (Supabase Storage public URL)
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  field_path TEXT,
  media_type TEXT NOT NULL CHECK(media_type IN ('image', 'audio')),
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  blob_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_notebook_card ON media (notebook_id, card_id);

CREATE TABLE IF NOT EXISTS card_progress (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  first_studied_at TIMESTAMPTZ,
  last_review_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  last_session_score INTEGER,
  consecutive_passes INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  schedule_policy_version TEXT NOT NULL DEFAULT '1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notebook_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_card_progress_notebook_id ON card_progress (notebook_id);

CREATE TABLE IF NOT EXISTS review_logs (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  exercise_session_id TEXT,
  level_before INTEGER,
  level_after INTEGER,
  due_before TEXT,
  due_after TEXT,
  session_score INTEGER,
  field_scores_json TEXT,
  hint_count INTEGER NOT NULL DEFAULT 0,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  policy_version TEXT,
  fsrs_rating TEXT CHECK(fsrs_rating IN ('again', 'hard', 'good', 'easy'))
);
CREATE INDEX IF NOT EXISTS idx_review_logs_notebook_card ON review_logs (notebook_id, card_id);
CREATE INDEX IF NOT EXISTS idx_review_logs_notebook_id ON review_logs (notebook_id);

CREATE TABLE IF NOT EXISTS exercise_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('learn', 'review', 'test', 'placement')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  coverage_required_json TEXT,
  coverage_completed_json TEXT,
  rating TEXT CHECK(rating IN ('again', 'hard', 'good', 'easy')),
  error_count INTEGER,
  score INTEGER
);
CREATE INDEX IF NOT EXISTS idx_exercise_sessions_notebook ON exercise_sessions (notebook_id);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES exercise_sessions(id) ON DELETE CASCADE,
  exercise_type TEXT NOT NULL CHECK(exercise_type IN ('flashcard', 'multiple_choice')),
  payload_json TEXT NOT NULL,
  tested_fields_json TEXT,
  source TEXT NOT NULL DEFAULT 'template' CHECK(source IN ('ai', 'template')),
  schema_version TEXT NOT NULL DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exercises_session ON exercises (session_id);
CREATE INDEX IF NOT EXISTS idx_exercises_notebook ON exercises (notebook_id);

CREATE TABLE IF NOT EXISTS exercise_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  answer_json TEXT,
  is_correct INTEGER,
  error_count INTEGER,
  self_rating TEXT CHECK(self_rating IN ('again', 'hard', 'good', 'easy')),
  feedback_json TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latency_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_exercise ON exercise_attempts (exercise_id);
CREATE INDEX IF NOT EXISTS idx_attempts_notebook ON exercise_attempts (notebook_id);

CREATE TABLE IF NOT EXISTS ai_cache (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  task TEXT NOT NULL,
  model_id TEXT,
  prompt_version TEXT,
  response_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(notebook_id, cache_key)
);
CREATE INDEX IF NOT EXISTS idx_ai_cache_notebook ON ai_cache (notebook_id);

CREATE TABLE IF NOT EXISTS skill_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  estimate INTEGER,
  confidence INTEGER,
  sample_count INTEGER NOT NULL DEFAULT 0,
  accuracy_30d INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notebook_id, skill)
);
CREATE INDEX IF NOT EXISTS idx_skill_profiles_notebook ON skill_profiles (notebook_id);

CREATE TABLE IF NOT EXISTS fsrs_parameters (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  fsrs_version TEXT NOT NULL DEFAULT 'FSRS-6',
  weights_json TEXT,
  desired_retention INTEGER,
  optimizer_version TEXT,
  sample_count INTEGER,
  trained_at TIMESTAMPTZ,
  is_active INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fsrs_params_notebook ON fsrs_parameters (notebook_id);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  file_name TEXT,
  file_hash TEXT,
  format TEXT,
  mapping_json TEXT,
  total_rows INTEGER,
  inserted_rows INTEGER,
  duplicate_rows INTEGER,
  error_rows INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_notebook ON import_jobs (notebook_id);

CREATE TABLE IF NOT EXISTS placement_runs (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  result_json TEXT,
  confidence_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_placement_runs_notebook ON placement_runs (notebook_id);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id TEXT PRIMARY KEY NOT NULL,
  notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'agnes',
  model_id TEXT,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  next_allowed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_notebook ON ai_rate_limits (notebook_id);
