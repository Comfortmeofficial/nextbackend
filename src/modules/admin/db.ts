import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __adminPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __adminSchemaReady: Promise<void> | undefined;
}

export function getAdminPool(): Pool {
  if (!global.__adminPool) {
    const connectionString = process.env.ADMIN_DATABASE_URL;
    if (!connectionString) {
      throw new Error("ADMIN_DATABASE_URL is not set");
    }
    global.__adminPool = new Pool({ connectionString, max: 3 });
  }
  return global.__adminPool;
}

// Mirrors the post-migration shape of services/admin_service/models/admin.py
// (this creates that end state directly rather than replaying the legacy
// name -> first_name/last_name migration, same approach used elsewhere).
// role is stored uppercase (SQLAlchemy's Enum(AdminRole) persists enum
// *names*, not values) and lowercased at the API boundary.
export function ensureAdminSchema(): Promise<void> {
  if (!global.__adminSchemaReady) {
    global.__adminSchemaReady = getAdminPool().query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL
          CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER_SUPPORT', 'FINANCE_OFFICER')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
      ALTER TABLE admins ADD CONSTRAINT admins_role_check
        CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER', 'CUSTOMER_SUPPORT', 'FINANCE_OFFICER', 'BUS_MARSHAL'));

      -- Added for the Bus Marshals profile page — same contact/next-of-kin
      -- shape as drivers (minus anything license-related, which doesn't
      -- apply to admin accounts). Generic to all admin roles rather than
      -- marshal-specific columns; harmless and unused for the other roles.
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS address VARCHAR(500);
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS next_of_kin VARCHAR(255);
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(20);
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(100);

      -- One row per admin-triggered mutation across the whole platform, not
      -- just this database — actor_id/actor_email are captured from the
      -- token at write time rather than joined against the admins table on
      -- read, so a log entry survives that admin account later being deleted.
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id VARCHAR(50) NOT NULL,
        actor_email VARCHAR(255) NOT NULL,
        action VARCHAR(20) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id VARCHAR(50),
        details JSONB,
        ip_address VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource, resource_id);
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__adminSchemaReady = undefined;
        throw err;
      });
  }
  return global.__adminSchemaReady;
}
