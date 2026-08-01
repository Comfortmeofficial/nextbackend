import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __syncPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __syncSchemaReady: Promise<void> | undefined;
}

export function getSyncPool(): Pool {
  if (!global.__syncPool) {
    const connectionString = process.env.SYNC_DATABASE_URL;
    if (!connectionString) {
      throw new Error("SYNC_DATABASE_URL is not set");
    }
    global.__syncPool = new Pool({ connectionString });
  }
  return global.__syncPool;
}

// Mirrors services/pg_tb_sync/src/main.rs's init_db(). This service is
// orphaned in the legacy platform (no APISIX route, no caller anywhere) —
// ported anyway per explicit instruction, faithfully, not extended.
export function ensureSyncSchema(): Promise<void> {
  if (!global.__syncSchemaReady) {
    global.__syncSchemaReady = getSyncPool().query(`
      CREATE TABLE IF NOT EXISTS sync_records (
        id               BIGSERIAL PRIMARY KEY,
        reference        VARCHAR(100) UNIQUE NOT NULL,
        amount           NUMERIC(15,2) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        status           VARCHAR(20) NOT NULL DEFAULT 'pending',
        synced_at        TIMESTAMPTZ,
        error_message    TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).then(() => undefined);
  }
  return global.__syncSchemaReady;
}
