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
        status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE'
          CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
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
      -- The driver's next of kin doubles as their emergency contact — the
      -- old standalone emergency_contact field is redundant now that we
      -- collect the next of kin's own phone and relationship to the driver.
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(20);
      ALTER TABLE drivers ADD COLUMN IF NOT EXISTS next_of_kin_relationship VARCHAR(100);
      -- Collapsed from six operational states (AVAILABLE/ASSIGNED/ON_TRIP/
      -- OFFLINE/ON_LEAVE/SUSPENDED) down to three: ACTIVE (currently on a
      -- trip), INACTIVE (everything else non-suspended), SUSPENDED
      -- (unchanged). The old constraint must come off BEFORE backfilling —
      -- it doesn't allow 'ACTIVE'/'INACTIVE' at all, so writing those values
      -- while it's still in effect fails outright. All three statements are
      -- no-ops once already migrated.
      ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
      UPDATE drivers SET status = 'ACTIVE' WHERE status = 'ON_TRIP';
      UPDATE drivers SET status = 'INACTIVE' WHERE status IN ('AVAILABLE', 'ASSIGNED', 'OFFLINE', 'ON_LEAVE');
      ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'));
      -- CREATE TABLE IF NOT EXISTS's own DEFAULT 'INACTIVE' above only takes
      -- effect on a fresh table — it never retroactively changes the column
      -- default on one that already existed (stuck at the old 'OFFLINE'),
      -- so every new driver created without an explicit status violated the
      -- constraint just added. Needs its own explicit ALTER.
      ALTER TABLE drivers ALTER COLUMN status SET DEFAULT 'INACTIVE';
      CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);
      CREATE INDEX IF NOT EXISTS idx_drivers_verification_status ON drivers (verification_status);
      CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at ON drivers (deleted_at);

      -- Same fix as admins/users/locations: plain UNIQUE constraints don't
      -- exclude soft-deleted drivers, so deleting one and re-adding with the
      -- same email/phone/license fails against the dead row's own entry.
      ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_email_key;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_email_active ON drivers (email) WHERE deleted_at IS NULL;
      ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_phone_key;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_phone_active ON drivers (phone) WHERE deleted_at IS NULL;
      ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_license_number_key;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_drivers_license_number_active ON drivers (license_number) WHERE deleted_at IS NULL;
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__driversSchemaReady = undefined;
        throw err;
      });
  }
  return global.__driversSchemaReady;
}
