import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { ensureAdminSchema, getAdminPool } from "./db";
import { ACCESS_TOKEN_TTL_SECONDS, createAccessToken } from "./jwt";
import { findActiveByEmail, toDto } from "./repository";
import type { AdminRow } from "./types";

export interface AdminLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  admin_id: string;
  role: string;
  admin: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
}

export async function login(email: string, password: string): Promise<AdminLoginResponse> {
  const admin = await findActiveByEmail(email);
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    throw new ApiError(401, "Invalid credentials");
  }
  if (!admin.is_active) {
    throw new ApiError(403, "Account is suspended");
  }

  const dto = toDto(admin);
  const token = createAccessToken({ sub: String(admin.id), email: admin.email, role: dto.role });

  // refresh_token is deliberately the SAME value as access_token — this is
  // a genuine bug in the source (no real refresh token is ever issued), not
  // a simplification made during the port. Preserved exactly per the
  // project's "preserve auth behavior exactly, gap and all" decision.
  return {
    access_token: token,
    refresh_token: token,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    admin_id: String(admin.id),
    role: dto.role,
    admin: {
      id: String(admin.id),
      email: admin.email,
      first_name: admin.first_name,
      last_name: admin.last_name,
      role: dto.role,
      is_active: admin.is_active,
      created_at: admin.created_at.toISOString(),
      updated_at: admin.updated_at.toISOString(),
    },
  };
}

// One-time bootstrap: seeds the super admin from SUPER_ADMIN_* env vars.
export async function setupSuperAdmin(): Promise<void> {
  await ensureAdminSchema();
  const pool = getAdminPool();

  const { rows: existingSuperAdmin } = await pool.query(
    `SELECT id FROM admins WHERE role = 'SUPER_ADMIN' AND deleted_at IS NULL LIMIT 1`,
  );
  if (existingSuperAdmin.length > 0) {
    throw new ApiError(409, "Super admin already exists");
  }

  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new ApiError(500, "SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars are not set");
  }
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME || "Super";
  const lastName = process.env.SUPER_ADMIN_LAST_NAME || "Admin";

  // Matches seed_super_admin's own duplicate-email check exactly: unscoped
  // by deleted_at, unlike the 409 check above — a soft-deleted admin
  // sharing this email still blocks seeding, but surfaces as this generic
  // 500 rather than the specific 409, matching the source's own asymmetry.
  const { rows: anyWithEmail } = await pool.query<AdminRow>(`SELECT id FROM admins WHERE email = $1`, [
    email,
  ]);
  if (anyWithEmail.length > 0) {
    throw new ApiError(500, "Seed failed unexpectedly");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admins (first_name, last_name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true)`,
    [firstName, lastName, email, passwordHash],
  );
}
