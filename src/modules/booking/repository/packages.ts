import { randomInt, randomUUID } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import { ensureBookingSchema, getBookingPool } from "../db";
import type { PackageDto, PackageRow, PackageStatus } from "../types";
import { getRideRow } from "./rides";
import { loadFullRoute } from "./routes";

async function toDto(row: PackageRow): Promise<PackageDto> {
  const ride = await getRideRow(row.ride_id);
  const route = ride ? await loadFullRoute(ride.route_id) : null;
  return {
    id: row.id,
    order_id: row.order_id,
    ride_id: row.ride_id,
    sender_user_id: row.sender_user_id,
    recipient_name: row.recipient_name,
    recipient_phone: row.recipient_phone,
    drop_off_note: row.drop_off_note,
    fare_amount: row.fare_amount,
    ...(row.delivery_otp ? { delivery_otp: row.delivery_otp } : {}),
    status: row.status,
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
          marshal_admin_id: ride.marshal_admin_id,
          marshal_name: ride.marshal_name,
          created_at: ride.created_at.toISOString(),
          updated_at: ride.updated_at.toISOString(),
        }
      : ({} as PackageDto["ride"]),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export interface CreatePackageInput {
  rideId: number;
  senderUserId: number;
  recipientName: string;
  recipientPhone: string;
  dropOffNote: string;
  fareAmount: number;
}

export async function createPackage(input: CreatePackageInput): Promise<PackageDto> {
  await ensureBookingSchema();
  // Mirrors Package.BeforeCreate: order_id "PK-" + first 8 uppercase chars
  // of a UUID; a 4-digit zero-padded delivery OTP.
  const orderId = `PK-${randomUUID().slice(0, 8).toUpperCase()}`;
  const deliveryOtp = String(randomInt(0, 10000)).padStart(4, "0");

  const pool = getBookingPool();
  try {
    const { rows } = await pool.query<PackageRow>(
      `INSERT INTO packages (
         order_id, ride_id, sender_user_id, recipient_name, recipient_phone,
         drop_off_note, fare_amount, delivery_otp, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_pickup')
       RETURNING *`,
      [
        orderId,
        input.rideId,
        input.senderUserId,
        input.recipientName,
        input.recipientPhone,
        input.dropOffNote,
        input.fareAmount,
        deliveryOtp,
      ],
    );
    return toDto(rows[0]);
  } catch (err) {
    throw new ApiError(500, err instanceof Error ? err.message : String(err));
  }
}

export async function getPackage(id: number): Promise<PackageDto> {
  await ensureBookingSchema();
  const row = await getPackageRow(id);
  if (!row) {
    throw new ApiError(404, "Package not found");
  }
  return toDto(row);
}

export async function getPackageRow(id: number): Promise<PackageRow | null> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<PackageRow>(
    `SELECT * FROM packages WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listPackagesByRide(rideId: number): Promise<PackageDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<PackageRow>(
    `SELECT * FROM packages WHERE ride_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [rideId],
  );
  return Promise.all(rows.map(toDto));
}

export async function listPackagesBySender(senderUserId: number): Promise<PackageDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const { rows } = await pool.query<PackageRow>(
    `SELECT * FROM packages WHERE sender_user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [senderUserId],
  );
  return Promise.all(rows.map(toDto));
}

export async function listAllPackages(
  skip: number,
  limit: number,
  rideId?: number,
): Promise<PackageDto[]> {
  await ensureBookingSchema();
  const pool = getBookingPool();
  const params: unknown[] = [];
  let where = "WHERE deleted_at IS NULL";
  if (rideId) {
    params.push(rideId);
    where += ` AND ride_id = $${params.length}`;
  }
  params.push(skip, limit);
  const { rows } = await pool.query<PackageRow>(
    `SELECT * FROM packages ${where} ORDER BY created_at DESC OFFSET $${params.length - 1} LIMIT $${params.length}`,
    params,
  );
  return Promise.all(rows.map(toDto));
}

export async function updatePackageStatus(id: number, status: PackageStatus): Promise<void> {
  const pool = getBookingPool();
  await pool.query(`UPDATE packages SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
}
