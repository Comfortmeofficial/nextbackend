import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { RentalDto, RentalPaymentMethod, RentalRow, RentalStatus } from "../types";

function toDto(row: RentalRow): RentalDto {
  return {
    id: row.id,
    user_id: row.user_id,
    pickup: row.pickup,
    destination: row.destination,
    event_type: row.event_type,
    pickup_date: row.pickup_date,
    pickup_time: row.pickup_time,
    phone: row.phone,
    notes: row.notes,
    is_round_trip: row.is_round_trip,
    return_date: row.return_date,
    return_time: row.return_time,
    amount: row.amount,
    payment_method: row.payment_method,
    status: row.status,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export interface CreateRentalInput {
  userId: number;
  pickup: string;
  destination: string;
  eventType: string;
  pickupDate: string;
  pickupTime: string;
  phone: string;
  notes: string;
  isRoundTrip: boolean;
  returnDate: string;
  returnTime: string;
  paymentMethod: RentalPaymentMethod;
}

export async function createRental(input: CreateRentalInput): Promise<RentalDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  try {
    const { rows } = await pool.query<RentalRow>(
      `INSERT INTO rentals (
         user_id, pickup, destination, event_type, pickup_date, pickup_time, phone,
         notes, is_round_trip, return_date, return_time, payment_method, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
       RETURNING *`,
      [
        input.userId,
        input.pickup,
        input.destination,
        input.eventType,
        input.pickupDate,
        input.pickupTime,
        input.phone,
        input.notes,
        input.isRoundTrip,
        input.returnDate,
        input.returnTime,
        input.paymentMethod,
      ],
    );
    return toDto(rows[0]);
  } catch (err) {
    throw new ApiError(500, err instanceof Error ? err.message : String(err));
  }
}

export async function listRentals(
  skip: number,
  limit: number,
  status?: RentalStatus,
  userId?: number,
): Promise<RentalDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const params: unknown[] = [];
  let where = "WHERE deleted_at IS NULL";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (userId) {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }
  params.push(skip, limit);
  const { rows } = await pool.query<RentalRow>(
    `SELECT * FROM rentals ${where} ORDER BY created_at DESC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return rows.map(toDto);
}

export async function getRental(id: number): Promise<RentalDto> {
  await ensureBookingSchema();
  const row = await getRentalRow(id);
  if (!row) {
    throw new ApiError(404, "Rental not found");
  }
  return toDto(row);
}

export async function getRentalRow(id: number): Promise<RentalRow | null> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<RentalRow>(
    `SELECT * FROM rentals WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateRentalStatus(
  id: number,
  status: RentalStatus,
  paymentMethod?: RentalPaymentMethod,
): Promise<RentalDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(`UPDATE rentals SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  if (paymentMethod) {
    await pool.query(`UPDATE rentals SET payment_method = $2, updated_at = now() WHERE id = $1`, [
      id,
      paymentMethod,
    ]);
  }
  return getRental(id);
}

// The only way a rental reaches "awaiting_payment" — an admin quoting a
// price. Only valid from "pending" (enforced by the caller, matching the
// source's own status check before calling this).
export async function updateRentalPrice(id: number, amount: number): Promise<RentalDto> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  await pool.query(
    `UPDATE rentals SET amount = $2, status = 'awaiting_payment', updated_at = now() WHERE id = $1`,
    [id, amount],
  );
  return getRental(id);
}
