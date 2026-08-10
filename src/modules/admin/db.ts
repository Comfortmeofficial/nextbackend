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
    global.__adminPool = new Pool({ connectionString });
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
    `).then(() => undefined);
  }
  return global.__adminSchemaReady;
}
