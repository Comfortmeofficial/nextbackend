import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { BusSeatDef } from "../external";
import { loadFullRoute } from "./routes";
import type { RideDto, RideRow, RideSeatDto, RideSeatRow, RideStatus } from "../types";

function toSeatDto(row: RideSeatRow): RideSeatDto {
  return {
    id: row.id,
    ride_id: row.ride_id,
    seat_number: row.seat_number,
    row: row.row,
    col: row.col,
    seat_type: row.seat_type,
    status: row.status,
    ...(row.booking_id != null ? { booking_id: row.booking_id } : {}),
  };
}

async function getSeats(rideId: number): Promise<RideSeatDto[]> {
  const pool = getBookingPool();
  const { rows } = await pool.query<RideSeatRow>(`SELECT * FROM ride_seats WHERE ride_id = $1`, [
    rideId,
  ]);
  return rows.map(toSeatDto);
}

// Matches GetByID: Route (with Location/Destination/Stops) AND Seats always
// preloaded — used for every single-ride response (create/get/status/bus/
// driver updates).
async function loadFullRide(id: number): Promise<RideDto | null> {
  const pool = getBookingPool();
  const { rows } = await pool.query<RideRow>(`SELECT * FROM rides WHERE id = $1 AND deleted_at IS NULL`, [
    id,
  ]);
  const ride = rows[0];
  if (!ride) return null;
  const route = await loadFullRoute(ride.route_id);
  const seats = await getSeats(ride.id);
  return rideRowToDto(ride, route!, seats);
}

// Matches List/Search: Route preloaded, Seats NOT — the `seats` key is
// omitted entirely from these responses (Go's omitempty on a nil slice).
async function loadRideForList(ride: RideRow): Promise<RideDto> {
  const route = await loadFullRoute(ride.route_id);
  return rideRowToDto(ride, route!, undefined);
}

function rideRowToDto(ride: RideRow, route: NonNullable<Awaited<ReturnType<typeof loadFullRoute>>>, seats?: RideSeatDto[]): RideDto {
  return {
    id: ride.id,
    route_id: ride.route_id,
    bus_id: ride.bus_id,
    driver_id: ride.driver_id,
    driver_name: ride.driver_name,
    driver_rating: ride.driver_rating,
    bus_plate: ride.bus_plate,
    bus_model: ride.bus_model,
    departure_time: ride.departure_time.toISOString(),
    arrival_time: ride.arrival_time ? ride.arrival_time.toISOString() : null,
    fare: ride.fare,
    total_seats: ride.total_seats,
    booked_seats: ride.booked_seats,
    status: ride.status,
    route,
    ...(seats !== undefined ? { seats } : {}),
    marshal_admin_id: ride.marshal_admin_id,
    marshal_name: ride.marshal_name,
    driver_row: ride.driver_row,
    driver_col: ride.driver_col,
    created_at: ride.created_at.toISOString(),
    updated_at: ride.updated_at.toISOString(),
  };
}

export interface SeatDef {
  seat_number: string;
  row: number;
  col: number;
  seat_type: string;
}

const NON_BOOKABLE = new Set(["driver", "walkway", "empty"]);

// seat_type='driver' cells are excluded from ride_seats (not a bookable
// seat) but the mobile app still needs their position to draw the
// steering-wheel icon where the admin actually placed it, rather than
// guessing — captured here before it's filtered out. Shared between
// ride creation and the layout-change resync below so both stay in sync.
export function seatDefsFromBusSeats(seats: BusSeatDef[] | null): {
  seatDefs: SeatDef[];
  driverRow: number | null;
  driverCol: number | null;
} {
  const seatDefs: SeatDef[] = [];
  let driverRow: number | null = null;
  let driverCol: number | null = null;
  if (seats) {
    for (const s of seats) {
      const seatType = s.seat_type || "standard";
      if (seatType === "driver") {
        driverRow = s.row;
        driverCol = s.col;
      }
      if (!s.is_seat || NON_BOOKABLE.has(seatType)) continue;
      seatDefs.push({ seat_number: s.seat_number, row: s.row, col: s.col, seat_type: seatType });
    }
  }
  return { seatDefs, driverRow, driverCol };
}

function generateSeats(total: number): SeatDef[] {
  const cols = 4;
  const seats: SeatDef[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols) + 1;
    const col = (i % cols) + 1;
    const rowLabel = String.fromCharCode("A".charCodeAt(0) + row - 1);
    seats.push({ seat_number: `${rowLabel}${col}`, row, col, seat_type: "standard" });
  }
  return seats;
}

export interface CreateRideInput {
  routeId: number;
  busId: number;
  driverId: number;
  driverName: string;
  driverRating: number;
  busPlate: string;
  busModel: string;
  departureTime: Date;
  arrivalTime: Date | null;
  fare: number;
  totalSeats: number;
  seatDefs: SeatDef[];
  driverRow: number | null;
  driverCol: number | null;
}

export async function createRide(input: CreateRideInput): Promise<RideDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<RideRow>(
      `INSERT INTO rides (
         route_id, bus_id, driver_id, driver_name, driver_rating, bus_plate, bus_model,
         departure_time, arrival_time, fare, total_seats, status, driver_row, driver_col
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled', $12, $13)
       RETURNING *`,
      [
        input.routeId,
        input.busId,
        input.driverId,
        input.driverName,
        input.driverRating,
        input.busPlate,
        input.busModel,
        input.departureTime,
        input.arrivalTime,
        input.fare,
        input.totalSeats,
        input.driverRow,
        input.driverCol,
      ],
    );
    const ride = rows[0];
    const seatDefs = input.seatDefs.length > 0 ? input.seatDefs : generateSeats(input.totalSeats);
    for (const seat of seatDefs) {
      await client.query(
        `INSERT INTO ride_seats (ride_id, seat_number, "row", col, seat_type, status)
         VALUES ($1, $2, $3, $4, $5, 'available')`,
        [ride.id, seat.seat_number, seat.row, seat.col, seat.seat_type],
      );
    }
    await client.query("COMMIT");
    return (await loadFullRide(ride.id))!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(500, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}

// A ride snapshots the bus's seat layout at creation time so an
// already-booked or in-progress trip is never disrupted by a later layout
// change. But a ride nobody has booked into yet has no reason to stay
// stale — whenever an admin saves a new layout, every affected ride that's
// still fully unbooked and not yet underway gets its seats regenerated to
// match. Rides with any booking, or past 'scheduled', are left untouched.
export async function resyncRideSeatsForBus(busId: number, seats: BusSeatDef[] | null): Promise<number[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows: candidates } = await pool.query<{ id: number }>(
    `SELECT id FROM rides WHERE bus_id = $1 AND deleted_at IS NULL AND status = 'scheduled' AND booked_seats = 0`,
    [busId],
  );
  if (candidates.length === 0) return [];

  const { seatDefs, driverRow, driverCol } = seatDefsFromBusSeats(seats);
  const totalSeats = seatDefs.length;
  const resynced: number[] = [];

  for (const { id: rideId } of candidates) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM ride_seats WHERE ride_id = $1`, [rideId]);
      for (const seat of seatDefs) {
        await client.query(
          `INSERT INTO ride_seats (ride_id, seat_number, "row", col, seat_type, status)
           VALUES ($1, $2, $3, $4, $5, 'available')`,
          [rideId, seat.seat_number, seat.row, seat.col, seat.seat_type],
        );
      }
      await client.query(
        `UPDATE rides SET total_seats = $2, driver_row = $3, driver_col = $4, updated_at = now() WHERE id = $1`,
        [rideId, totalSeats, driverRow, driverCol],
      );
      await client.query("COMMIT");
      resynced.push(rideId);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  return resynced;
}

export async function listRides(skip: number, limit: number, status?: string): Promise<RideDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const params: unknown[] = [];
  let where = "WHERE deleted_at IS NULL";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  params.push(skip, limit);
  const { rows } = await pool.query<RideRow>(
    `SELECT * FROM rides ${where} ORDER BY departure_time ASC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return Promise.all(rows.map(loadRideForList));
}

export async function getRide(id: number): Promise<RideDto> {
  await ensureBookingSchema();
  const ride = await loadFullRide(id);
  if (!ride) {
    throw new ApiError(404, "Ride not found");
  }
  return ride;
}

export async function getRideRow(id: number): Promise<RideRow | null> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideRow>(`SELECT * FROM rides WHERE id = $1 AND deleted_at IS NULL`, [
    id,
  ]);
  return rows[0] ?? null;
}

export async function getRideSeats(id: number): Promise<RideSeatDto[]> {
  await ensureBookingSchema();
  return getSeats(id);
}

export async function updateRideStatus(id: number, status: RideStatus): Promise<RideDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE rides SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  return (await loadFullRide(id))!;
}

export async function updateRideBus(
  id: number,
  busId: number,
  plate: string,
  model: string,
): Promise<RideDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(
    `UPDATE rides SET bus_id = $2, bus_plate = $3, bus_model = $4, updated_at = now() WHERE id = $1`,
    [id, busId, plate, model],
  );
  return (await loadFullRide(id))!;
}

export async function updateRideDriver(
  id: number,
  driverId: number,
  name: string,
  rating: number,
): Promise<RideDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(
    `UPDATE rides SET driver_id = $2, driver_name = $3, driver_rating = $4, updated_at = now() WHERE id = $1`,
    [id, driverId, name, rating],
  );
  return (await loadFullRide(id))!;
}

export async function updateRideMarshal(
  id: number,
  marshalAdminId: number | null,
  marshalName: string | null,
): Promise<RideDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(
    `UPDATE rides SET marshal_admin_id = $2, marshal_name = $3, updated_at = now() WHERE id = $1`,
    [id, marshalAdminId, marshalName],
  );
  return (await loadFullRide(id))!;
}

// GET /api/v1/rides/mine — a marshal's own assigned trips.
export async function listRidesByMarshal(marshalAdminId: number): Promise<RideDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RideRow>(
    `SELECT * FROM rides WHERE marshal_admin_id = $1 AND deleted_at IS NULL ORDER BY departure_time ASC`,
    [marshalAdminId],
  );
  return Promise.all(rows.map(loadRideForList));
}

export async function setBoardingCode(id: number, code: string): Promise<void> {
  const pool = getBookingPool();
  await pool.query(`UPDATE rides SET boarding_code = $2, updated_at = now() WHERE id = $1`, [id, code]);
}

// Search returns rides whose route location/destination (or stops) match
// the query. Exact destination match takes priority over partial/stop
// matches — if any exact matches exist, partial matches aren't even
// attempted, matching the source's early return.
export async function searchRides(
  locationQuery: string,
  destinationQuery: string,
  skip: number,
  limit: number,
  fromDate?: string | null,
  toDate?: string | null,
): Promise<RideDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();

  const exact = await runSearchQuery(pool, locationQuery, destinationQuery, skip, limit, "exact", fromDate, toDate);
  if (exact.length > 0) {
    return Promise.all(exact.map(loadRideForList));
  }
  const partial = await runSearchQuery(pool, locationQuery, destinationQuery, skip, limit, "partial", fromDate, toDate);
  return Promise.all(partial.map(loadRideForList));
}

async function runSearchQuery(
  pool: ReturnType<typeof getBookingPool>,
  locationQuery: string,
  destinationQuery: string,
  skip: number,
  limit: number,
  mode: "exact" | "partial",
  fromDate?: string | null,
  toDate?: string | null,
): Promise<RideRow[]> {
  const conditions = [`rides.status = 'scheduled'`, `rides.deleted_at IS NULL`];
  const params: unknown[] = [];

  if (fromDate) {
    params.push(fromDate);
    conditions.push(`rides.departure_time >= $${params.length}`);
  }
  if (toDate) {
    // Inclusive of the whole `to_date` day — add one day and use `<`.
    params.push(toDate);
    conditions.push(`rides.departure_time < ($${params.length}::date + interval '1 day')`);
  }

  if (destinationQuery) {
    if (mode === "exact") {
      params.push(destinationQuery);
      conditions.push(`LOWER(destinations.name) = LOWER($${params.length})`);
    } else {
      params.push(`%${destinationQuery.toLowerCase()}%`);
      const destParam = params.length;
      params.push(`%${destinationQuery.toLowerCase()}%`);
      const stopParam = params.length;
      conditions.push(
        `(LOWER(destinations.name) LIKE LOWER($${destParam}) OR EXISTS (
           SELECT 1 FROM route_stops rs2 JOIN stops s2 ON s2.id = rs2.stop_id
           WHERE rs2.route_id = routes.id AND LOWER(s2.name) LIKE LOWER($${stopParam})
         ))`,
      );
    }
  }
  if (locationQuery) {
    params.push(`%${locationQuery}%`);
    conditions.push(`LOWER(locations.name) LIKE LOWER($${params.length})`);
  }

  params.push(skip, limit);
  const { rows } = await pool.query<RideRow>(
    `SELECT rides.* FROM rides
     JOIN routes ON routes.id = rides.route_id
     JOIN destinations ON destinations.id = routes.destination_id
     JOIN locations ON locations.id = routes.location_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY rides.departure_time ASC
     OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return rows;
}
