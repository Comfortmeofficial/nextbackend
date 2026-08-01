import { Pool, QueryResult } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __authPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __authSchemaReady: Promise<void> | undefined;
}

// Mirrors services/auth_service/src/utils/db.ts exactly, including the SSL
// toggle — that service's Postgres apparently needs permissive SSL when a
// real DATABASE_URL is configured, unlike the other (in-cluster) services
// ported so far, which never set this.
function getAuthPool(): Pool {
  if (!global.__authPool) {
    const connectionString = process.env.AUTH_DATABASE_URL;
    global.__authPool = new Pool({
      connectionString: connectionString || "postgres://postgres:postgres@localhost:5432/auth_service",
      ssl: connectionString ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
    });
  }
  return global.__authPool;
}

export function query(text: string, params?: unknown[]): Promise<QueryResult> {
  return getAuthPool().query(text, params);
}

export function ensureAuthSchema(): Promise<void> {
  if (!global.__authSchemaReady) {
    global.__authSchemaReady = getAuthPool().query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER UNIQUE,
        email       VARCHAR(255) UNIQUE NOT NULL,
        phone       VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        role        VARCHAR(20) DEFAULT 'user',
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS otps (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) NOT NULL,
        otp        VARCHAR(10) NOT NULL,
        purpose    VARCHAR(30) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used       BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        token      TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked    BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS waitlist_entries (
        id           SERIAL PRIMARY KEY,
        full_name    VARCHAR(255) NOT NULL,
        email        VARCHAR(255) UNIQUE NOT NULL,
        phone        VARCHAR(20),
        city         VARCHAR(100),
        occupation   VARCHAR(100),
        commute_days VARCHAR(30),
        challenge    TEXT,
        preference   VARCHAR(20),
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `).then(() => undefined);
  }
  return global.__authSchemaReady;
}
