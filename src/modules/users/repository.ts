import { randomBytes } from "node:crypto";
import { ApiError } from "@/lib/http-errors";
import { ensureUsersSchema, getUsersPool } from "./db";
import type { UserDto, UserRow } from "./types";
import type { PreferencesInput, UserCreateInput, UserUpdateInput } from "./validation";

function toDto(row: UserRow): UserDto {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    emergency_contact_name: row.emergency_contact_name,
    emergency_contact_phone: row.emergency_contact_phone,
    emergency_contact_relationship: row.emergency_contact_relationship,
    referral_code: row.referral_code,
    push_token: row.push_token,
    push_notifications_enabled: row.push_notifications_enabled,
    face_id_enabled: row.face_id_enabled,
    is_active: row.is_active,
    is_verified: row.is_verified,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

async function findActiveById(id: number): Promise<UserRow | null> {
  const pool = getUsersPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(input: UserCreateInput): Promise<UserDto> {
  await ensureUsersSchema();
  const email = input.email.trim().toLowerCase();
  const pool = getUsersPool();

  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
    [email],
  );
  if (existing.length > 0) {
    throw new ApiError(409, "User with this email already exists");
  }

  // password_hash has no login purpose here (auth_service owns real
  // credentials) — the legacy service fills it with a random placeholder
  // via Python's secrets.token_hex(32); this is the same 32-random-bytes-as-hex shape.
  const placeholderPasswordHash = randomBytes(32).toString("hex");

  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (
       first_name, last_name, email, phone, password_hash,
       city, state, referral_code,
       emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      input.first_name,
      input.last_name,
      email,
      input.phone ?? null,
      placeholderPasswordHash,
      input.city ?? null,
      input.state ?? null,
      input.referral_code ?? null,
      input.emergency_contact_name ?? null,
      input.emergency_contact_phone ?? null,
      input.emergency_contact_relationship ?? null,
    ],
  );
  return toDto(rows[0]);
}

export async function listUsers(skip: number, limit: number): Promise<UserDto[]> {
  await ensureUsersSchema();
  const pool = getUsersPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE deleted_at IS NULL OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toDto);
}

export async function getUser(id: number): Promise<UserDto | null> {
  await ensureUsersSchema();
  const row = await findActiveById(id);
  return row ? toDto(row) : null;
}

export async function getUserByEmail(email: string): Promise<UserDto | null> {
  await ensureUsersSchema();
  const pool = getUsersPool();
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ? toDto(rows[0]) : null;
}

// Generic partial-update writer shared by PUT /{id}, the preferences PATCH,
// and the push-token PATCH — all three ultimately do what
// services/user.py::update_user does: fetch-or-404, apply only the fields
// present (nulls/undefined dropped), stamp updated_at.
async function applyUpdate(id: number, fields: Record<string, unknown>): Promise<UserDto> {
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "User not found");
  }

  const entries = Object.entries(fields).filter(([, value]) => value != null);
  if (entries.length === 0) {
    return toDto(row);
  }

  const setClauses = entries.map(([col], i) => `${col} = $${i + 2}`);
  setClauses.push(`updated_at = now()`);
  const pool = getUsersPool();
  const { rows } = await pool.query<UserRow>(
    `UPDATE users SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
  return toDto(rows[0]);
}

export async function updateUser(id: number, input: UserUpdateInput): Promise<UserDto> {
  await ensureUsersSchema();
  const email = input.email != null ? input.email.trim().toLowerCase() : input.email;
  // Fields listed explicitly (not `{...input}`) so the set of possible SQL
  // column names in applyUpdate's dynamic SET clause is always a fixed,
  // hardcoded list — consistent with every other module's update function,
  // and not reliant on zod's default key-stripping to stay that way.
  return applyUpdate(id, {
    first_name: input.first_name,
    last_name: input.last_name,
    email,
    phone: input.phone,
    city: input.city,
    state: input.state,
    emergency_contact_name: input.emergency_contact_name,
    emergency_contact_phone: input.emergency_contact_phone,
    emergency_contact_relationship: input.emergency_contact_relationship,
    push_token: input.push_token,
    push_notifications_enabled: input.push_notifications_enabled,
    face_id_enabled: input.face_id_enabled,
    is_active: input.is_active,
    is_verified: input.is_verified,
  });
}

export async function updatePreferences(id: number, input: PreferencesInput): Promise<UserDto> {
  await ensureUsersSchema();
  return applyUpdate(id, {
    push_notifications_enabled: input.push_notifications_enabled,
    face_id_enabled: input.face_id_enabled,
  });
}

export async function updatePushToken(id: number, pushToken: string): Promise<UserDto> {
  await ensureUsersSchema();
  return applyUpdate(id, { push_token: pushToken });
}

export async function deleteUser(id: number): Promise<void> {
  await ensureUsersSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "User not found");
  }
  const pool = getUsersPool();
  await pool.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [id]);
}
