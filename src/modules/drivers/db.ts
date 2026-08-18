import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __driversPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __driversSchemaReady: Promise<void> | undefined;
}

export function getDriversPool(): Pool {
  if (!global.__driversPool) {
    const connectionString = process.env.DRIVER_DATABASE_URL;
    if (!connectionString) {
      throw new Error("DRIVER_DATABASE_URL is not set");
    }
    global.__driversPool = new Pool({ connectionString, max: 3 });
  }
  return global.__driversPool;
}

// Mirrors the final shape of services/driver_service/models/driver.py after
// its database/migrate.py backfills — this creates that end state directly
// rather than replaying the incremental ALTER TABLEs, same approach used for
// user_service's is_verified column.
//
// status is stored uppercase (SQLAlchemy's Enum(DriverStatus) persists enum
// *names*, not values) and lowercased at the API boundary, same pattern as
// terms/rewards. verification_status, unlike status, is a plain VARCHAR in
// the source model (no SQLAlchemy Enum wrapper) so it's stored and returned
// as-is, lowercase, no mapping needed.
export function ensureDriversSchema(): Promise<void> {
  if (!global.__driversSchemaReady) {
    global.__driversSchemaReady = getDriversPool().query(`
      CREATE TABLE IF NOT EXISTS drivers (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL DEFAULT '',
        last_name VARCHAR(100) NOT NULL DEFAULT '',
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL UNIQUE,
        address VARCHAR(500),
        emergency_contact VARCHAR(100),
        next_of_kin VARCHAR(255),
        license_number VARCHAR(50) NOT NULL UNIQUE,
        license_expiry DATE,
        driver_type VARCHAR(50),
        password_hash VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
          CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'OFFLINE', 'ON_LEAVE', 'SUSPENDED')),
        verification_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        is_active BOOLEAN NOT NULL DEFAULT true,
        rating NUMERIC(3, 2) NOT NULL DEFAULT 5.0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        total_trips INTEGER NOT NULL DEFAULT 0,
        assigned_bus_id INTEGER,
        current_ride_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;
    `).then(() => undefined);
  }
  return global.__driversSchemaReady;
}
