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
    `)
      .then(() => undefined)
      .catch((err) => {
        global.__busesSchemaReady = undefined;
        throw err;
      });
  }
  return global.__busesSchemaReady;
}
