import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { getCurrentRideIdForDriver, getCurrentRideIdsForDrivers } from "@/modules/booking/repository/rides";
import { getBusIdForDriver, getBusIdsForDrivers } from "@/modules/buses/repository";
import { ensureDriversSchema, getDriversPool } from "./db";
import type { DriverDto, DriverRow, DriverStatusApi } from "./types";
import type { DriverCreateInput, DriverUpdateInput } from "./validation";

const SELECT_COLUMNS = `
  id, first_name, last_name, email, phone, address,
  next_of_kin, next_of_kin_phone, next_of_kin_relationship,
  license_number, TO_CHAR(license_expiry, 'YYYY-MM-DD') AS license_expiry,
  password_hash, status, verification_status, is_active, rating, total_trips,
  assigned_bus_id, current_ride_id, created_at, updated_at
`;

function toApiStatus(status: DriverRow["status"]): DriverStatusApi {
  return status.toLowerCase() as DriverStatusApi;
}

function toDbStatus(status: DriverStatusApi): DriverRow["status"] {
  return status.toUpperCase() as DriverRow["status"];
}

// assigned_bus_id/current_ride_id are derived here rather than read off the
// row — buses.driver_id and rides.driver_id are the single sources of truth
// (see getBusIdForDriver/getCurrentRideIdForDriver); the drivers table's own
// columns of the same name are legacy and no longer written by application
// code, so reading them back would silently reintroduce the drift this fixes.
export async function toDto(row: DriverRow): Promise<DriverDto> {
  const [assignedBusId, currentRideId] = await Promise.all([
    getBusIdForDriver(row.id),
    getCurrentRideIdForDriver(row.id),
  ]);
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    next_of_kin: row.next_of_kin,
    next_of_kin_phone: row.next_of_kin_phone,
    next_of_kin_relationship: row.next_of_kin_relationship,
    license_number: row.license_number,
    license_expiry: row.license_expiry,
    status: toApiStatus(row.status),
    verification_status: row.verification_status,
    rating: parseFloat(row.rating),
    total_trips: row.total_trips,
    assigned_bus_id: assignedBusId,
    current_ride_id: currentRideId,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

// Batched counterpart to toDto for list endpoints — avoids N+1 lookups
// against the buses/rides pools when rendering the full drivers table.
async function toDtoList(rows: DriverRow[]): Promise<DriverDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [busIds, rideIds] = await Promise.all([
    getBusIdsForDrivers(ids),
    getCurrentRideIdsForDrivers(ids),
  ]);
  return rows.map((row) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    next_of_kin: row.next_of_kin,
    next_of_kin_phone: row.next_of_kin_phone,
    next_of_kin_relationship: row.next_of_kin_relationship,
    license_number: row.license_number,
    license_expiry: row.license_expiry,
    status: toApiStatus(row.status),
    verification_status: row.verification_status,
    rating: parseFloat(row.rating),
    total_trips: row.total_trips,
    assigned_bus_id: busIds.get(row.id) ?? null,
    current_ride_id: rideIds.get(row.id) ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }));
}

// Best-effort side effect of the ride lifecycle — called from
// booking/repository/rides.ts's updateRideStatus()/updateRideDriver() so a
// driver's availability always follows the ride they're actually on, instead
// of being written independently (and driftably) by admin UI actions. Never
// throws: a notification-style failure here must not fail the ride request
// that triggered it.
export async function setDriverTripStatus(
  driverId: number,
  event: "on_trip" | "completed" | "cancelled",
): Promise<void> {
  try {
    await ensureDriversSchema();
    const row = await findActiveById(driverId);
    if (!row) return;
    const current = toApiStatus(row.status);
    // Never pull a suspended driver back to inactive/active off a ride event.
    if (current === "suspended") return;

    const pool = getDriversPool();
    if (event === "on_trip") {
      await pool.query(`UPDATE drivers SET status = 'ACTIVE', updated_at = now() WHERE id = $1`, [driverId]);
    } else if (event === "completed") {
      await pool.query(
        `UPDATE drivers SET status = 'INACTIVE', total_trips = total_trips + 1, updated_at = now() WHERE id = $1`,
        [driverId],
      );
    } else {
      await pool.query(`UPDATE drivers SET status = 'INACTIVE', updated_at = now() WHERE id = $1`, [driverId]);
    }
  } catch (err) {
    console.error(`setDriverTripStatus(${driverId}, ${event}) failed:`, err);
  }
}

export async function findActiveById(id: number): Promise<DriverRow | null> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${SELECT_COLUMNS} FROM drivers WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findActiveByEmail(email: string): Promise<DriverRow | null> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${SELECT_COLUMNS} FROM drivers WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

export async function createDriver(input: DriverCreateInput): Promise<DriverDto> {
  await ensureDriversSchema();
  const existing = await findActiveByEmail(input.email);
  if (existing) {
    throw new ApiError(409, "Driver with this email already exists");
  }

  // Hashed and stored, but — matching the legacy service exactly — never
  // returned anywhere. The only way an admin actually obtains a usable
  // driver password is the separate reset-password endpoint, which *does*
  // return its generated password. This one is a discard-only placeholder.
  const tempPassword = randomBytes(16).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `INSERT INTO drivers (
       first_name, last_name, email, phone, address,
       next_of_kin, next_of_kin_phone, next_of_kin_relationship,
       license_number, license_expiry, password_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.first_name,
      input.last_name,
      input.email,
      input.phone,
      input.address ?? null,
      input.next_of_kin ?? null,
      input.next_of_kin_phone ?? null,
      input.next_of_kin_relationship ?? null,
      input.license_number,
      input.license_expiry ?? null,
      passwordHash,
    ],
  );
  return toDto(rows[0]);
}

export async function listDrivers(skip: number, limit: number): Promise<DriverDto[]> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${SELECT_COLUMNS} FROM drivers WHERE deleted_at IS NULL OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return toDtoList(rows);
}

// "Available" here just means eligible for a new assignment — matches
// assertDriverAssignable's own rule (anything short of suspended), not the
// old AVAILABLE-only state that no longer exists under the 3-state model.
export async function listAvailableDrivers(): Promise<DriverDto[]> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${SELECT_COLUMNS} FROM drivers WHERE status != 'SUSPENDED' AND deleted_at IS NULL`,
  );
  return toDtoList(rows);
}

export async function getDriver(id: number): Promise<DriverDto> {
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  return toDto(row);
}

// Drivers have no verification/approval step — they're assignable as soon
// as they're created. The only thing that blocks an assignment is being
// suspended.
export async function assertDriverAssignable(id: number): Promise<void> {
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  if (toApiStatus(row.status) === "suspended") {
    throw new ApiError(400, `driver ${id} is suspended`);
  }
}

async function applyUpdate(id: number, fields: Record<string, unknown>): Promise<DriverDto> {
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }

  const entries = Object.entries(fields).filter(([, value]) => value != null);
  if (entries.length === 0) {
    return toDto(row);
  }

  const setClauses = entries.map(([col], i) => `${col} = $${i + 2}`);
  setClauses.push(`updated_at = now()`);
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `UPDATE drivers SET ${setClauses.join(", ")} WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id, ...entries.map(([, value]) => value)],
  );
  return toDto(rows[0]);
}

export async function updateDriver(id: number, input: DriverUpdateInput): Promise<DriverDto> {
  await ensureDriversSchema();
  return applyUpdate(id, {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    next_of_kin: input.next_of_kin,
    next_of_kin_phone: input.next_of_kin_phone,
    next_of_kin_relationship: input.next_of_kin_relationship,
    license_number: input.license_number,
    license_expiry: input.license_expiry,
    status: input.status ? toDbStatus(input.status) : null,
  });
}

export async function deleteDriver(id: number): Promise<void> {
  await ensureDriversSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  const pool = getDriversPool();
  await pool.query(`UPDATE drivers SET deleted_at = now() WHERE id = $1`, [id]);
}

// Recomputes the driver's aggregate rating as a running mean over every
// rating they've actually received. total_trips isn't usable as the
// denominator here — most completed trips never get rated, so weighting by
// it would silently understate how much a single new rating should move
// the average.
export async function recordRating(driverId: number, rating: number): Promise<void> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  await pool.query(
    `UPDATE drivers
     SET rating = ROUND((rating * rating_count + $2) / (rating_count + 1), 2),
         rating_count = rating_count + 1,
         updated_at = now()
     WHERE id = $1`,
    [driverId, rating],
  );
}
