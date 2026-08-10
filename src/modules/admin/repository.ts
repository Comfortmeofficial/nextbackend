import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { ensureAdminSchema, getAdminPool } from "./db";
import type { AdminDto, AdminRoleApi, AdminRow } from "./types";
import type { AdminCreateInput, AdminUpdateInput } from "./validation";

function toApiRole(role: AdminRow["role"]): AdminRoleApi {
  return role.toLowerCase() as AdminRoleApi;
}

function toDbRole(role: AdminRoleApi): AdminRow["role"] {
  return role.toUpperCase() as AdminRow["role"];
}

export function toDto(row: AdminRow): AdminDto {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    role: toApiRole(row.role),
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function findActiveByEmail(email: string): Promise<AdminRow | null> {
  await ensureAdminSchema();
  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `SELECT * FROM admins WHERE email = $1 AND deleted_at IS NULL`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findActiveById(id: number): Promise<AdminRow | null> {
  await ensureAdminSchema();
  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `SELECT * FROM admins WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createAdmin(input: AdminCreateInput): Promise<AdminDto> {
  await ensureAdminSchema();
  const existing = await findActiveByEmail(input.email);
  if (existing) {
    throw new ApiError(409, "Admin with this email already exists");
  }
  const passwordHash = await bcrypt.hash(input.password, 12);

  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `INSERT INTO admins (first_name, last_name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.first_name, input.last_name, input.email, passwordHash, toDbRole(input.role)],
  );
  return toDto(rows[0]);
}

export async function listAdmins(skip: number, limit: number): Promise<AdminDto[]> {
  await ensureAdminSchema();
  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `SELECT * FROM admins WHERE deleted_at IS NULL OFFSET $1 LIMIT $2`,
    [skip, limit],
  );
  return rows.map(toDto);
}

export async function getAdmin(id: number): Promise<AdminDto | null> {
  const row = await findActiveById(id);
  return row ? toDto(row) : null;
}

// Lightweight roster for ride/marshal assignment UI — active bus_marshal
// accounts only, not the full admin list (ops staff assigning marshals to
// trips shouldn't need visibility into e.g. super_admin accounts).
export async function listMarshals(): Promise<AdminDto[]> {
  await ensureAdminSchema();
  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `SELECT * FROM admins WHERE deleted_at IS NULL AND is_active = true AND role = 'BUS_MARSHAL' ORDER BY first_name, last_name`,
  );
  return rows.map(toDto);
}

export async function updateAdmin(id: number, input: AdminUpdateInput): Promise<AdminDto> {
  await ensureAdminSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Admin not found");
  }

  const entries = Object.entries({
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    role: input.role ? toDbRole(input.role) : null,
    is_active: input.is_active,
  }).filter(([, value]) => value != null);

  if (entries.length === 0) {
    return toDto(row);
  }

  const setClauses = entries.map(([col], i) => `${col} = $${i + 2}`);
  setClauses.push(`updated_at = now()`);
  const pool = getAdminPool();
  const { rows } = await pool.query<AdminRow>(
    `UPDATE admins SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...entries.map(([, value]) => value)],
  );
  return toDto(rows[0]);
}

export async function deleteAdmin(id: number): Promise<void> {
  await ensureAdminSchema();
  const row = await findActiveById(id);
  if (!row) {
    throw new ApiError(404, "Admin not found");
  }
  const pool = getAdminPool();
  await pool.query(`UPDATE admins SET deleted_at = now() WHERE id = $1`, [id]);
}
