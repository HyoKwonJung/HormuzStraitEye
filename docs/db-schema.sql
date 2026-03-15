-- Hormuz Military Dashboard initial schema (PostgreSQL + PostGIS)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  url TEXT,
  trust_level SMALLINT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raw_documents (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  url TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sub_type TEXT,
  actor TEXT,
  target TEXT,
  severity SMALLINT NOT NULL CHECK (severity BETWEEN 0 AND 100),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  event_time TIMESTAMPTZ,
  geom GEOGRAPHY(POINT, 4326),
  uncertainty_km NUMERIC(6,2),
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_mentions (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  raw_document_id BIGINT NOT NULL REFERENCES raw_documents(id) ON DELETE CASCADE,
  extraction_confidence NUMERIC(4,3) NOT NULL CHECK (extraction_confidence BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, raw_document_id)
);

CREATE TABLE IF NOT EXISTS warnings (
  id BIGSERIAL PRIMARY KEY,
  authority TEXT NOT NULL,
  warning_code TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  geom GEOGRAPHY(GEOMETRY, 4326),
  raw_text TEXT NOT NULL,
  severity SMALLINT CHECK (severity BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id BIGSERIAL PRIMARY KEY,
  area_name TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  incident_score NUMERIC(5,2) NOT NULL,
  diversity_score NUMERIC(5,2) NOT NULL,
  proximity_score NUMERIC(5,2) NOT NULL,
  warning_score NUMERIC(5,2) NOT NULL,
  air_signal_score NUMERIC(5,2) NOT NULL,
  total_score NUMERIC(5,2) NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_event_time ON events(event_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_geom ON events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_warnings_geom ON warnings USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_area_time ON risk_snapshots(area_name, computed_at DESC);
