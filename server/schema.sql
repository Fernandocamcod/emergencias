-- AlertaEmergencia — PostgreSQL Schema
-- Run this once to initialize the database

CREATE TABLE IF NOT EXISTS users (
  uid            TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT,
  phone          TEXT,
  emergency_contact TEXT,
  role           TEXT NOT NULL DEFAULT 'user',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid            TEXT NOT NULL,
  email          TEXT,
  name           TEXT,
  phone          TEXT,
  emergency_contact TEXT,
  type           TEXT,
  type_label     TEXT,
  message        TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  status         TEXT NOT NULL DEFAULT 'active',
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_uid    ON alerts(uid);
CREATE INDEX IF NOT EXISTS idx_alerts_ts     ON alerts(timestamp DESC);
