import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __notificationsPool: Pool | null | undefined;
  // eslint-disable-next-line no-var
  var __notificationsSchemaReady: Promise<void> | undefined;
}

// Unlike every other module, storage here is genuinely optional in the
// source (database/setup.py builds `engine`/`SessionLocal` as None when
// DATABASE_URL is unset, and every route explicitly handles a None session
// by degrading — skip storing, return an empty inbox — rather than failing).
// This preserves that: a notification service that can still send without a
// working database, since losing an inbox row is far less severe than
// dropping the send entirely.
export function getNotificationsPool(): Pool | null {
  if (global.__notificationsPool === undefined) {
    const connectionString = process.env.NOTIFICATION_DATABASE_URL;
    global.__notificationsPool = connectionString ? new Pool({ connectionString, max: 3 }) : null;
  }
  return global.__notificationsPool;
}

export async function ensureNotificationsSchema(): Promise<void> {
  const pool = getNotificationsPool();
  if (!pool) return;
  if (!global.__notificationsSchemaReady) {
    global.__notificationsSchemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);

      -- Admin-managed list of addresses that get an email every time a
      -- booking is created, so ops can keep an eye on booking activity
      -- without logging into the dashboard.
      CREATE TABLE IF NOT EXISTS booking_alert_emails (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        created_by_admin_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__notificationsSchemaReady = undefined;
        throw err;
      });
  }
  return global.__notificationsSchemaReady;
}
