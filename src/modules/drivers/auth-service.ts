import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { ApiError } from "@/lib/http-errors";
import { getDriversPool } from "./db";
import { createAccessToken, createRefreshToken, decodeToken } from "./jwt";
import { findActiveByEmail, findActiveById, toDto } from "./repository";
import type { DriverDto } from "./types";

export interface DriverTokenResponse {
  access_token: string;
  refresh_token: string;
  driver: DriverDto;
}

export async function login(email: string, password: string): Promise<DriverTokenResponse> {
  const row = await findActiveByEmail(email);
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  if (!row.is_active) {
    throw new ApiError(403, "Driver account is inactive");
  }
  return {
    access_token: createAccessToken(row.id),
    refresh_token: createRefreshToken(row.id),
    driver: await toDto(row),
  };
}

// Only mints a new access token — the refresh token itself is never rotated
// or revoked here (unlike the customer auth module). That's a genuine
// simplicity/asymmetry in the source service, not an oversight in the port:
// there's no refresh_tokens table for drivers at all.
export async function refresh(refreshToken: string): Promise<{ access_token: string }> {
  let driverId: number;
  try {
    driverId = decodeToken(refreshToken, "refresh");
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }
  const row = await findActiveById(driverId);
  if (!row || !row.is_active) {
    throw new ApiError(401, "Driver not found or inactive");
  }
  return { access_token: createAccessToken(row.id) };
}

// Admin-triggered: generates a new temporary password and returns it once
// (there is currently no self-service "forgot password" flow for drivers —
// the admin communicates the new password out-of-band).
export async function resetPassword(driverId: number): Promise<string> {
  const row = await findActiveById(driverId);
  if (!row) {
    throw new ApiError(404, "Driver not found");
  }
  const tempPassword = randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const pool = getDriversPool();
  await pool.query(`UPDATE drivers SET password_hash = $1, updated_at = now() WHERE id = $2`, [
    passwordHash,
    driverId,
  ]);
  return tempPassword;
}
