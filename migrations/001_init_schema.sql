-- Plate8 Initial Schema
-- Run this in Supabase SQL editor or via migrations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Users table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  profile_picture_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = auth_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instrument VARCHAR(50) NOT NULL CHECK (instrument IN ('state8', 'mate8', 'skate8', 'slate8', 'late8', 'plate8')),
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'recording' CHECK (status IN ('recording', 'processing', 'complete', 'failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_instrument_idx ON sessions(instrument);
CREATE INDEX sessions_created_at_idx ON sessions(created_at DESC);
CREATE INDEX sessions_status_idx ON sessions(status);
CREATE INDEX sessions_user_created_idx ON sessions(user_id, created_at DESC);

-- Enable RLS on sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id OR user_id IN (SELECT auth_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can delete own sessions" ON sessions
  FOR DELETE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Session Analytics table
CREATE TABLE IF NOT EXISTS session_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE UNIQUE,
  metrics JSONB DEFAULT '{}',
  summary TEXT,
  insight_type VARCHAR(100),
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX analytics_session_id_idx ON session_analytics(session_id);
CREATE INDEX analytics_generated_at_idx ON session_analytics(generated_at DESC);

-- Enable RLS on session_analytics
ALTER TABLE session_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view analytics for own sessions" ON session_analytics
  FOR SELECT USING (session_id IN (SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())));

-- Spectrum Samples table (State8 specific, high-volume)
CREATE TABLE IF NOT EXISTS spectrum_samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp BIGINT NOT NULL,
  frequency_bins FLOAT8[] NOT NULL,
  peak_frequency FLOAT,
  volume_rms FLOAT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for spectrum samples
CREATE INDEX spectrum_session_id_idx ON spectrum_samples(session_id);
CREATE INDEX spectrum_timestamp_idx ON spectrum_samples(timestamp DESC);
CREATE INDEX spectrum_session_time_idx ON spectrum_samples(session_id, timestamp DESC);

-- Enable RLS on spectrum_samples
ALTER TABLE spectrum_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view spectrum for own sessions" ON spectrum_samples
  FOR SELECT USING (session_id IN (SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())));

-- Session Files table
CREATE TABLE IF NOT EXISTS session_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  file_type VARCHAR(50) NOT NULL CHECK (file_type IN ('audio_raw', 'video_raw', 'spectrum_json', 'export_mp3', 'export_json')),
  storage_path VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER,
  processing_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'ready', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for session files
CREATE INDEX session_files_session_id_idx ON session_files(session_id);
CREATE INDEX session_files_processing_status_idx ON session_files(processing_status);

-- Enable RLS on session_files
ALTER TABLE session_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view files for own sessions" ON session_files
  FOR SELECT USING (session_id IN (SELECT id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())));

-- Instrument State table (for presence tracking)
CREATE TABLE IF NOT EXISTS instrument_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  active_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  instrument VARCHAR(50),
  last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'recording', 'processing')),
  current_metrics JSONB DEFAULT '{}'
);

-- Indexes for instrument state
CREATE INDEX instrument_state_user_idx ON instrument_state(user_id);
CREATE INDEX instrument_state_last_update_idx ON instrument_state(last_update DESC);

-- Enable RLS on instrument_state
ALTER TABLE instrument_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own state" ON instrument_state
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY "Users can update own state" ON instrument_state
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Auto-update updated_at timestamps
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
