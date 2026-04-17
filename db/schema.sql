CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  years_experience INTEGER NOT NULL DEFAULT 0,
  seniority TEXT NOT NULL DEFAULT 'unknown',
  location TEXT,
  languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_cv_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_search_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  preferred_location TEXT,
  work_type TEXT NOT NULL DEFAULT 'any',
  min_fit_percent INTEGER NOT NULL DEFAULT 45,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_work_type CHECK (work_type IN ('remote', 'hybrid', 'onsite', 'any')),
  CONSTRAINT valid_fit_range CHECK (min_fit_percent BETWEEN 0 AND 100)
);
