import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { ensureDriversSchema, getDriversPool } from "./db";
import type { DriverDto, DriverRow, DriverStatusApi } from "./types";
import type { DriverCreateInput, DriverUpdateInput } from "./validation";

const SELECT_COLUMNS = `
  id, first_name, last_name, email, phone, address, emergency_contact, next_of_kin,
  license_number, TO_CHAR(license_expiry, 'YYYY-MM-DD') AS license_expiry, driver_type,
  password_hash, status, verification_status, is_active, rating, total_trips,
  assigned_bus_id, current_ride_id, created_at, updated_at
`;

function toApiStatus(status: DriverRow["status"]): DriverStatusApi {
  return status.toLowerCase() as DriverStatusApi;
}

function toDbStatus(status: DriverStatusApi): DriverRow["status"] {
  return status.toUpperCase() as DriverRow["status"];
}

export function toDto(row: DriverRow): DriverDto {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    emergency_contact: row.emergency_contact,
    next_of_kin: row.next_of_kin,
    license_number: row.license_number,
    license_expiry: row.license_expiry,
    driver_type: row.driver_type,
    status: toApiStatus(row.status),
    verification_status: row.verification_status,
    rating: parseFloat(row.rating),
    total_trips: row.total_trips,
    assigned_bus_id: row.assigned_bus_id,
    current_ride_id: row.current_ride_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
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
       first_name, last_name, email, phone, address, emergency_contact, next_of_kin,
       license_number, license_expiry, driver_type, password_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SELECT_COLUMNS}`,
    [
      input.first_name,
      input.last_name,
      input.email,
      input.phone,
      input.address ?? null,
      input.emergency_contact ?? null,
      input.next_of_kin ?? null,
      input.license_number,
      input.license_expiry ?? null,
      input.driver_type ?? null,
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
  return rows.map(toDto);
}

export async function listAvailableDrivers(): Promise<DriverDto[]> {
  await ensureDriversSchema();
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `SELECT ${SELECT_COLUMNS} FROM drivers WHERE status = 'AVAILABLE' AND deleted_at IS NULL`,
  );
  return rows.map(toDto);
}

export async function getDriver(id: number): Promise<DriverDto> {
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  return toDto(row);
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
    emergency_contact: input.emergency_contact,
    next_of_kin: input.next_of_kin,
    license_number: input.license_number,
    license_expiry: input.license_expiry,
    driver_type: input.driver_type,
    status: input.status ? toDbStatus(input.status) : null,
    verification_status: input.verification_status,
    // rejection_reason intentionally omitted — see validation.ts comment.
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

export async function assignBus(id: number, busId: number): Promise<DriverDto> {
  await ensureDriversSchema();
  return applyUpdate(id, { assigned_bus_id: busId });
}

export async function unassignBus(id: number): Promise<DriverDto> {
  await ensureDriversSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `UPDATE drivers SET assigned_bus_id = NULL, updated_at = now() WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id],
  );
  return toDto(rows[0]);
}

export async function assignRide(id: number, rideId: number): Promise<DriverDto> {
  await ensureDriversSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  if (row.status === "ON_TRIP") {
    throw new ApiError(400, "Driver is already on a trip");
  }
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `UPDATE drivers SET current_ride_id = $2, status = 'ON_TRIP', updated_at = now()
     WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id, rideId],
  );
  return toDto(rows[0]);
}

export async function completeRide(id: number): Promise<DriverDto> {
  await ensureDriversSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  const pool = getDriversPool();
  const { rows } = await pool.query<DriverRow>(
    `UPDATE drivers
     SET current_ride_id = NULL, status = 'AVAILABLE', total_trips = total_trips + 1, updated_at = now()
     WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
    [id],
  );
  return toDto(rows[0]);
}
