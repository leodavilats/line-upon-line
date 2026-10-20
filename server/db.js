import pg from 'pg'

// Sem DATABASE_URL o site funciona normalmente; só não registra acessos.
export const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : false,
      max: 5,
    })
  : null

export async function migrate() {
  if (!pool) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id            BIGSERIAL PRIMARY KEY,
      session_id    TEXT NOT NULL UNIQUE,
      visitor_id    TEXT NOT NULL,
      is_new        BOOLEAN NOT NULL,
      started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      device_type   TEXT,
      browser       TEXT,
      os            TEXT,
      screen        TEXT,
      language      TEXT,
      country       TEXT,
      region        TEXT,
      city          TEXT,
      referrer      TEXT,
      path          TEXT,
      ip_hash       TEXT
    );
    CREATE INDEX IF NOT EXISTS visits_started_at_idx ON visits (started_at);
    CREATE INDEX IF NOT EXISTS visits_visitor_id_idx ON visits (visitor_id);
  `)
}
