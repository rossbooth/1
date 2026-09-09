import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from './sqlite.js';
import { ROOT } from './config.js';

export const DB_PATH = path.join(ROOT, 'data', 'flights.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS aircraft (
  hex           TEXT PRIMARY KEY,
  reg           TEXT,
  type_code     TEXT,
  description   TEXT,
  own_op        TEXT,
  year          INTEGER,
  military      INTEGER DEFAULT 0,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  times_seen    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_aircraft_reg ON aircraft(reg);
CREATE INDEX IF NOT EXISTS idx_aircraft_last_seen ON aircraft(last_seen DESC);

-- One row per takeoff/landing at the home airport, or per pass overhead.
CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hex           TEXT NOT NULL,
  reg           TEXT,
  kind          TEXT NOT NULL CHECK (kind IN ('departure','arrival','overflight')),
  airport       TEXT,
  ts            INTEGER NOT NULL,
  confidence    TEXT NOT NULL DEFAULT 'likely',
  peak_alt_ft   INTEGER,
  min_alt_ft    INTEGER,
  closest_home_nm  REAL,
  closest_home_ts  INTEGER,
  track_json    TEXT,
  UNIQUE (hex, kind, ts)
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_hex ON events(hex);
CREATE INDEX IF NOT EXISTS idx_events_kind_ts ON events(kind, ts DESC);

-- One row per continuous appearance of an aircraft in the watch area.
CREATE TABLE IF NOT EXISTS sightings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  hex              TEXT NOT NULL,
  reg              TEXT,
  started_at       INTEGER NOT NULL,
  ended_at         INTEGER NOT NULL,
  closest_home_nm  REAL,
  closest_home_ts  INTEGER,
  min_alt_ft       INTEGER,
  max_alt_ft       INTEGER,
  max_speed_kt     INTEGER,
  UNIQUE (hex, started_at)
);
CREATE INDEX IF NOT EXISTS idx_sightings_started ON sightings(started_at DESC);

-- FAA aircraft registration database (MASTER.txt), imported on demand.
CREATE TABLE IF NOT EXISTS registry (
  n_number       TEXT PRIMARY KEY,
  serial_number  TEXT,
  mfr_mdl_code   TEXT,
  eng_mfr_mdl    TEXT,
  year_mfr       INTEGER,
  type_registrant TEXT,
  owner_name     TEXT,
  street         TEXT,
  city           TEXT,
  state          TEXT,
  zip_code       TEXT,
  country        TEXT,
  last_action_date TEXT,
  cert_issue_date  TEXT,
  status_code    TEXT,
  mode_s_hex     TEXT,
  expiration_date TEXT,
  kit_mfr        TEXT,
  kit_model      TEXT
);
CREATE INDEX IF NOT EXISTS idx_registry_hex ON registry(mode_s_hex);
CREATE INDEX IF NOT EXISTS idx_registry_owner ON registry(owner_name);

-- FAA aircraft model reference (ACFTREF.txt).
CREATE TABLE IF NOT EXISTS registry_models (
  code         TEXT PRIMARY KEY,
  manufacturer TEXT,
  model        TEXT,
  type_acft    TEXT,
  type_eng     TEXT,
  ac_cat       TEXT,
  no_eng       INTEGER,
  no_seats     INTEGER,
  ac_weight    TEXT,
  speed        INTEGER
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

let db = null;

export function getDb(dbPath = DB_PATH) {
  if (db) return db;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = createDatabase(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

/** Used by tests to get a throwaway database. */
export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const handle = createDatabase(dbPath);
  handle.pragma('journal_mode = WAL');
  handle.exec(SCHEMA);
  return handle;
}

export function setMeta(handle, key, value) {
  handle
    .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

export function getMeta(handle, key) {
  return handle.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}
