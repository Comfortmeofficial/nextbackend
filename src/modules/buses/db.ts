import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __busesPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __busesSchemaReady: Promise<void> | undefined;
}

export function getBusesPool(): Pool {
  if (!global.__busesPool) {
    const connectionString = process.env.BUS_DATABASE_URL;
    if (!connectionString) {
      throw new Error("BUS_DATABASE_URL is not set");
    }
    global.__busesPool = new Pool({ connectionString, max: 3 });
  }
  return global.__busesPool;
}

// Mirrors services/bus_service/src/main.rs's init_db().
export function ensureBusesSchema(): Promise<void> {
  if (!global.__busesSchemaReady) {
    global.__busesSchemaReady = getBusesPool().query(`
      CREATE TABLE IF NOT EXISTS buses (
        id           SERIAL PRIMARY KEY,
        plate_number VARCHAR(50) UNIQUE NOT NULL,
        capacity     INTEGER NOT NULL DEFAULT 0,
        model        VARCHAR(100) NOT NULL,
        status       VARCHAR(20) NOT NULL DEFAULT 'active',
        driver_id    INTEGER,
        layout       JSONB NOT NULL DEFAULT '{}',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_buses_driver_id ON buses (driver_id);
      CREATE INDEX IF NOT EXISTS idx_buses_status ON buses (status);
      -- id/driver_id were originally BIGINT/BIGSERIAL, but every table that
      -- references a bus (rides.bus_id, ride_schedules.bus_id,
      -- drivers.assigned_bus_id) and buses.driver_id's own target
      -- (drivers.id) are plain INTEGER/SERIAL — narrow to INTEGER to match
      -- the rest of the schema. Confirmed safe against live data first
      -- (max id/driver_id both single digits, nowhere near the int4 range).
      ALTER TABLE buses ALTER COLUMN id TYPE INTEGER USING id::integer;
      ALTER TABLE buses ALTER COLUMN driver_id TYPE INTEGER USING driver_id::integer;

      -- A bus has at most one driver (buses.driver_id above), but any number
      -- of marshals — a plain many-to-many join table, unlike the single
      -- nullable driver_id column. marshal_id references admins.id (marshals
      -- are just admin accounts with role = 'BUS_MARSHAL'); the composite
      -- primary key both enforces "no duplicate assignment" and gives us the
      -- per-bus lookup index for free.
      CREATE TABLE IF NOT EXISTS bus_marshals (
        bus_id INTEGER NOT NULL,
        marshal_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (bus_id, marshal_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bus_marshals_marshal_id ON bus_marshals (marshal_id);

      -- Picture and insurance document/dates are single-valued (one current
      -- picture, one current insurance policy), stored directly on the bus
      -- row. Images are stored as data URIs (no object storage configured
      -- for this app) — fine at admin-tool scale (a handful of buses,
      -- occasional updates), not meant for high-volume user uploads.
      ALTER TABLE buses ADD COLUMN IF NOT EXISTS picture TEXT;
      ALTER TABLE buses ADD COLUMN IF NOT EXISTS insurance_document TEXT;
      ALTER TABLE buses ADD COLUMN IF NOT EXISTS insurance_incorporation_date DATE;
      ALTER TABLE buses ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE;

      -- Unlike picture/insurance, a bus can have any number of other
      -- documents (roadworthiness certificate, permit, etc.), each with its
      -- own title — a separate table rather than more single columns.
      CREATE TABLE IF NOT EXISTS bus_documents (
        id SERIAL PRIMARY KEY,
        bus_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        image TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bus_documents_bus_id ON bus_documents (bus_id);

      -- Same three categories as the driver_type field that used to exist on
      -- drivers (intercity/intrastate/shuttle) — which route type a bus is
      -- suited for, set at creation.
      ALTER TABLE buses ADD COLUMN IF NOT EXISTS bus_type VARCHAR(50);
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__busesSchemaReady = undefined;
        throw err;
      });
  }
  return global.__busesSchemaReady;
}
