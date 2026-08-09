import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { BookingDto, BookingRow, PaymentMethod } from "../types";
import { getRideRow } from "./rides";
import { loadFullRoute } from "./routes";

async function toDto(row: BookingRow): Promise<BookingDto> {
  const ride = await getRideRow(row.ride_id);
  const route = ride ? await loadFullRoute(ride.route_id) : null;
  return {
    id: row.id,
    reference: row.reference,
    group_reference: row.group_reference,
    user_id: row.user_id,
    ride_id: row.ride_id,
    seat_number: row.seat_number,
    amount: row.amount,
    discount_amount: row.discount_amount,
    final_amount: row.final_amount,
    coupon_code: row.coupon_code,
    payment_method: row.payment_method,
    status: row.status,
    is_on_board: row.is_on_board,
    pickup_stop_id: row.pickup_stop_id,
    // Nested ride never carries `seats` here — the source's booking
    // preloads (Ride.Route.*) never touch Ride.Seats either.
    ride: ride
      ? {
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
          route: route!,
          created_at: ride.created_at.toISOString(),
          updated_at: ride.updated_at.toISOString(),
        }
      : ({} as BookingDto["ride"]),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export interface BookingSeatInput {
  userId: number;
  rideId: number;
  seatNumber: string;
  amount: number;
  discountAmount: number;
  finalAmount: number;
  couponCode: string;
  groupReference: string;
  paymentMethod: PaymentMethod;
  pickupStopId?: number | null;
}

async function insertBookingRow(client: PoolClient, input: BookingSeatInput): Promise<BookingRow> {
  // Lock the seat — mirrors the source's transaction: find an available
  // seat row, fail the whole operation if it isn't there.
  const seatRes = await client.query(
    `SELECT id FROM ride_seats WHERE ride_id = $1 AND seat_number = $2 AND status = 'available'`,
    [input.rideId, input.seatNumber],
  );
  if (seatRes.rowCount === 0) {
    throw new Error(`seat ${input.seatNumber} is not available`);
  }
  const seatId = seatRes.rows[0].id;

  const reference = randomUUID();
  const { rows } = await client.query(
    `INSERT INTO bookings (
       reference, group_reference, user_id, ride_id, seat_number, amount,
       discount_amount, final_amount, coupon_code, payment_method, status, pickup_stop_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', $11)
     RETURNING *`,
    [
      reference,
      input.groupReference,
      input.userId,
      input.rideId,
      input.seatNumber,
      input.amount,
      input.discountAmount,
      input.finalAmount,
      input.couponCode,
      input.paymentMethod,
      input.pickupStopId ?? null,
    ],
  );
  const booking = rows[0] as BookingRow;

  await client.query(`UPDATE ride_seats SET status = 'booked', booking_id = $2 WHERE id = $1`, [
    seatId,
    booking.id,
  ]);

  return booking;
}

export async function createBooking(input: BookingSeatInput): Promise<BookingDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const booking = await insertBookingRow(client, input);
    await client.query(`UPDATE rides SET booked_seats = booked_seats + 1 WHERE id = $1`, [
      input.rideId,
    ]);
    await client.query("COMMIT");
    return toDto(booking);
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(409, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}

// Books every seat in a single all-or-nothing transaction — if any seat is
// unavailable, the whole batch rolls back and nothing is reserved.
export async function createBookingsBulk(inputs: BookingSeatInput[]): Promise<BookingDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const bookings: BookingRow[] = [];
    for (const input of inputs) {
      bookings.push(await insertBookingRow(client, input));
    }
    await client.query(`UPDATE rides SET booked_seats = booked_seats + $2 WHERE id = $1`, [
      inputs[0].rideId,
      inputs.length,
    ]);
    await client.query("COMMIT");
    return Promise.all(bookings.map(toDto));
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(409, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}

export async function getBooking(id: number): Promise<BookingDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) {
    throw new ApiError(404, "Booking not found");
  }
  return toDto(rows[0]);
}

async function getBookingRow(id: number): Promise<BookingRow | null> {
  const pool = getBookingPool();
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getBookingByReference(reference: string): Promise<BookingDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings WHERE reference = $1 AND deleted_at IS NULL`,
    [reference],
  );
  if (!rows[0]) {
    throw new ApiError(404, "Booking not found");
  }
  return toDto(rows[0]);
}

export async function listBookingsByGroup(reference: string): Promise<BookingDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings WHERE group_reference = $1 AND deleted_at IS NULL ORDER BY seat_number ASC`,
    [reference],
  );
  if (rows.length === 0) {
    throw new ApiError(404, "Booking group not found");
  }
  return Promise.all(rows.map(toDto));
}

export async function listBookingsByUser(
  userId: number,
  skip: number,
  limit: number,
): Promise<BookingDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC OFFSET $2 LIMIT $3`,
    [userId, skip, limit],
  );
  return Promise.all(rows.map(toDto));
}

export async function listAllBookings(
  skip: number,
  limit: number,
  rideId?: number,
): Promise<BookingDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const params: unknown[] = [];
  let where = "WHERE deleted_at IS NULL";
  if (rideId) {
    params.push(rideId);
    where += ` AND ride_id = $${params.length}`;
  }
  params.push(skip, limit);
  const { rows } = await pool.query<BookingRow>(
    `SELECT * FROM bookings ${where} ORDER BY created_at DESC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return Promise.all(rows.map(toDto));
}

export async function markOnBoard(id: number): Promise<BookingDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE bookings SET is_on_board = true, updated_at = now() WHERE id = $1`, [id]);
  return getBooking(id);
}

export async function completeBooking(id: number): Promise<BookingDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE bookings SET status = 'completed', updated_at = now() WHERE id = $1`, [id]);
  return getBooking(id);
}

// Loads the booking + its ride's current boarding_code, so callers don't
// need to hit the DB twice to check a rider-supplied code.
export async function checkBoardingCode(id: number, code: string): Promise<BookingRow> {
  const booking = await getBookingRow(id);
  if (!booking) {
    throw new Error("booking not found");
  }
  const ride = await getRideRow(booking.ride_id);
  if (!ride || !ride.boarding_code || ride.boarding_code !== code) {
    throw new Error("invalid or expired code");
  }
  return booking;
}

// Matches the source exactly: Cancel's internal "not found" case propagates
// GORM's literal error string, and the handler maps ANY Cancel() failure —
// missing booking included — to 400, not 404.
export async function cancelBooking(id: number): Promise<void> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<BookingRow>(
      `SELECT * FROM bookings WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const booking = rows[0];
    if (!booking) {
      throw new Error("record not found");
    }
    await client.query(`UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1`, [
      id,
    ]);
    await client.query(
      `UPDATE ride_seats SET status = 'available', booking_id = NULL WHERE ride_id = $1 AND seat_number = $2`,
      [booking.ride_id, booking.seat_number],
    );
    await client.query(`UPDATE rides SET booked_seats = booked_seats - 1 WHERE id = $1`, [
      booking.ride_id,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw new ApiError(400, err instanceof Error ? err.message : String(err));
  } finally {
    client.release();
  }
}
