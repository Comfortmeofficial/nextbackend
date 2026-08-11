import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __bookingPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __bookingSchemaReady: Promise<void> | undefined;
}

export function getBookingPool(): Pool {
  if (!global.__bookingPool) {
    const connectionString = process.env.BOOKING_DATABASE_URL;
    if (!connectionString) {
      throw new Error("BOOKING_DATABASE_URL is not set");
    }
    global.__bookingPool = new Pool({ connectionString });
  }
  return global.__bookingPool;
}

// Mirrors the GORM AutoMigrate set in cmd/server/main.go. Status enums are
// stored as plain lowercase text (GORM's Go string-typed enums, no native
// Postgres enum wrapper — unlike the SQLAlchemy services ported earlier,
// there's no name-vs-value storage split to worry about here).
export function ensureBookingSchema(): Promise<void> {
  if (!global.__bookingSchemaReady) {
    global.__bookingSchemaReady = getBookingPool().query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        state VARCHAR(255) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_locations_deleted_at ON locations (deleted_at);

      CREATE TABLE IF NOT EXISTS destinations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        state VARCHAR(255) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_destinations_deleted_at ON destinations (deleted_at);

      CREATE TABLE IF NOT EXISTS stops (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        state VARCHAR(255) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_stops_deleted_at ON stops (deleted_at);

      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        location_id INTEGER NOT NULL,
        destination_id INTEGER NOT NULL,
        distance DOUBLE PRECISION NOT NULL DEFAULT 0,
        estimated_duration_minutes INTEGER,
        google_distance_km DOUBLE PRECISION,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_routes_deleted_at ON routes (deleted_at);

      CREATE TABLE IF NOT EXISTS route_stops (
        id SERIAL PRIMARY KEY,
        route_id INTEGER NOT NULL,
        stop_id INTEGER NOT NULL,
        stop_order INTEGER NOT NULL,
        fare DOUBLE PRECISION
      );
      ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS fare DOUBLE PRECISION;
      CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON route_stops (route_id);

      CREATE TABLE IF NOT EXISTS rides (
        id SERIAL PRIMARY KEY,
        route_id INTEGER NOT NULL,
        bus_id INTEGER NOT NULL,
        driver_id INTEGER NOT NULL,
        driver_name VARCHAR(255) NOT NULL,
        driver_rating DOUBLE PRECISION NOT NULL DEFAULT 0,
        bus_plate VARCHAR(255) NOT NULL,
        bus_model VARCHAR(255) NOT NULL,
        departure_time TIMESTAMPTZ NOT NULL,
        arrival_time TIMESTAMPTZ,
        fare DOUBLE PRECISION NOT NULL,
        total_seats INTEGER NOT NULL,
        booked_seats INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        boarding_code VARCHAR(20) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_rides_route_id ON rides (route_id);
      CREATE INDEX IF NOT EXISTS idx_rides_deleted_at ON rides (deleted_at);
      ALTER TABLE rides ADD COLUMN IF NOT EXISTS marshal_admin_id INTEGER;
      ALTER TABLE rides ADD COLUMN IF NOT EXISTS marshal_name VARCHAR(255);
      -- The driver's grid position from the bus layout admins configure —
      -- captured at ride-creation time since seat_type='driver' cells are
      -- deliberately excluded from ride_seats (not a bookable seat) and
      -- would otherwise be unrecoverable once a ride exists.
      ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_row INTEGER;
      ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_col INTEGER;
      CREATE INDEX IF NOT EXISTS idx_rides_marshal_admin_id ON rides (marshal_admin_id);

      CREATE TABLE IF NOT EXISTS ride_seats (
        id SERIAL PRIMARY KEY,
        ride_id INTEGER NOT NULL,
        seat_number VARCHAR(20) NOT NULL,
        "row" INTEGER NOT NULL DEFAULT 0,
        col INTEGER NOT NULL DEFAULT 0,
        seat_type VARCHAR(50) NOT NULL DEFAULT 'standard',
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        booking_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_ride_seats_ride_id ON ride_seats (ride_id);

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(255) NOT NULL UNIQUE,
        group_reference VARCHAR(255) NOT NULL DEFAULT '',
        user_id INTEGER NOT NULL,
        ride_id INTEGER NOT NULL,
        seat_number VARCHAR(20) NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        final_amount DOUBLE PRECISION NOT NULL,
        coupon_code VARCHAR(255) NOT NULL DEFAULT '',
        payment_method VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        is_on_board BOOLEAN NOT NULL DEFAULT false,
        pickup_stop_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_stop_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_ride_id ON bookings (ride_id);
      CREATE INDEX IF NOT EXISTS idx_bookings_group_reference ON bookings (group_reference);
      CREATE INDEX IF NOT EXISTS idx_bookings_deleted_at ON bookings (deleted_at);

      CREATE TABLE IF NOT EXISTS rentals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        pickup VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        pickup_date VARCHAR(50) NOT NULL,
        pickup_time VARCHAR(50) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        is_round_trip BOOLEAN NOT NULL DEFAULT false,
        return_date VARCHAR(50) NOT NULL DEFAULT '',
        return_time VARCHAR(50) NOT NULL DEFAULT '',
        amount DOUBLE PRECISION NOT NULL DEFAULT 0,
        payment_method VARCHAR(20) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_rentals_user_id ON rentals (user_id);
      CREATE INDEX IF NOT EXISTS idx_rentals_deleted_at ON rentals (deleted_at);

      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL UNIQUE,
        ride_id INTEGER NOT NULL,
        sender_user_id INTEGER NOT NULL,
        recipient_name VARCHAR(255) NOT NULL,
        recipient_phone VARCHAR(255) NOT NULL,
        drop_off_note TEXT NOT NULL DEFAULT '',
        fare_amount DOUBLE PRECISION NOT NULL,
        delivery_otp VARCHAR(10) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'pending_pickup',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_packages_ride_id ON packages (ride_id);
      CREATE INDEX IF NOT EXISTS idx_packages_sender_user_id ON packages (sender_user_id);
      CREATE INDEX IF NOT EXISTS idx_packages_deleted_at ON packages (deleted_at);

      -- One thread per (ride, customer) pair, with that ride's assigned
      -- marshal on the other end. sender_type is enough context per message
      -- since a ride has at most one marshal at read time.
      CREATE TABLE IF NOT EXISTS trip_chat_messages (
        id SERIAL PRIMARY KEY,
        ride_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('customer', 'marshal')),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_trip_chat_thread ON trip_chat_messages (ride_id, user_id, created_at);
    `).then(() => undefined);
  }
  return global.__bookingSchemaReady;
}
