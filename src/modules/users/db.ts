import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __usersPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __usersSchemaReady: Promise<void> | undefined;
}

export function getUsersPool(): Pool {
  if (!global.__usersPool) {
    const connectionString = process.env.USER_DATABASE_URL;
    if (!connectionString) {
      throw new Error("USER_DATABASE_URL is not set");
    }
    global.__usersPool = new Pool({ connectionString, max: 3 });
  }
  return global.__usersPool;
}

// Mirrors services/user_service/database/setup.py + database/migrate.py.
// is_verified is included from the start here (the legacy migrate.py only
// backfills it for tables created before that column existed).
export function ensureUsersSchema(): Promise<void> {
  if (!global.__usersSchemaReady) {
    global.__usersSchemaReady = getUsersPool().query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_verified BOOLEAN NOT NULL DEFAULT false,
        city VARCHAR(100),
        state VARCHAR(100),
        emergency_contact_name VARCHAR(100),
        emergency_contact_phone VARCHAR(20),
        emergency_contact_relationship VARCHAR(50),
        referral_code VARCHAR(50),
        push_token VARCHAR(255),
        push_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
        face_id_enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )
    `).then(() => undefined);
  }
  return global.__usersSchemaReady;
}
