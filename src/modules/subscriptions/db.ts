import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __subscriptionsPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __subscriptionsSchemaReady: Promise<void> | undefined;
}

// Mirrors src/utils/db.ts exactly, including the SSL toggle — same pattern
// as the auth module, and for the same reason: this service's own
// DATABASE_URL apparently needs permissive SSL when actually configured.
function getSubscriptionsPool(): Pool {
  if (!global.__subscriptionsPool) {
    const connectionString = process.env.SUBSCRIPTION_DATABASE_URL;
    global.__subscriptionsPool = new Pool({
      connectionString:
        connectionString || "postgres://postgres:postgres@localhost:5432/subscription_service",
      ssl: connectionString ? { rejectUnauthorized: false } : false,
    });
  }
  return global.__subscriptionsPool;
}

export function query(text: string, params?: unknown[]) {
  return getSubscriptionsPool().query(text, params);
}

// This service is orphaned in the legacy platform (has an APISIX route, but
// no UI ever calls it) — ported anyway per explicit instruction, faithfully.
export function ensureSubscriptionsSchema(): Promise<void> {
  if (!global.__subscriptionsSchemaReady) {
    global.__subscriptionsSchemaReady = getSubscriptionsPool().query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(100) UNIQUE NOT NULL,
        price        NUMERIC(10,2) NOT NULL,
        duration_days INTEGER NOT NULL,
        description  TEXT,
        is_active    BOOLEAN DEFAULT TRUE,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL,
        plan_id    INTEGER NOT NULL REFERENCES subscription_plans(id),
        status     VARCHAR(20) NOT NULL DEFAULT 'active',
        starts_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).then(() => undefined);
  }
  return global.__subscriptionsSchemaReady;
}
