import bcrypt from "bcryptjs";
import { after } from "next/server";
import { ApiError } from "@/lib/http-errors";
import { createUser, updateUser } from "@/modules/users/repository";
import { sendOtpNotification, sendWaitlistNotification } from "@/modules/notifications/service";
import { ensureAuthSchema, query } from "./db";
import { AuthError } from "./errors";
import {
  generateOTP,
  refreshExpiryDate,
  signAccess,
  signRefresh,
  verifyRefresh,
  type TokenPayload,
} from "./jwt";

const SALT_ROUNDS = 10;
const OTP_TTL_MINUTES = 10;

// Emails are matched/stored case-insensitively — "Foo@x.com" and "foo@x.com"
// must be treated as the same account everywhere.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------- OTP ----------

export async function sendOTP(email: string, purpose: string): Promise<string> {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await query("INSERT INTO otps (email, otp, purpose, expires_at) VALUES ($1, $2, $3, $4)", [
    email,
    otp,
    purpose,
    expiresAt,
  ]);

  // Fire-and-forget, matching the source's un-awaited axios.post().catch(() => {}) —
  // notification_service now lives in this app, so this is a direct call
  // instead of an HTTP loopback, but the non-blocking behavior is preserved.
  // Wrapped in after() so Vercel keeps the function alive until this
  // settles instead of freezing the runtime once the response is sent.
  after(() => sendOtpNotification({ email, otp, purpose }).catch(() => {}));

  return otp;
}

export async function verifyOTP(email: string, otp: string, purpose: string): Promise<boolean> {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const res = await query(
    `SELECT id FROM otps
     WHERE email = $1 AND otp = $2 AND purpose = $3 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, otp, purpose],
  );
  if (res.rowCount === 0) return false;
  await query("UPDATE otps SET used = TRUE WHERE id = $1", [res.rows[0].id]);
  return true;
}

// Read-only check — does not consume the code. Used when a later step (e.g.
// actually resetting the password) still needs to verify the same OTP.
export async function checkOTP(email: string, otp: string, purpose: string): Promise<boolean> {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const res = await query(
    `SELECT id FROM otps
     WHERE email = $1 AND otp = $2 AND purpose = $3 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [email, otp, purpose],
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------- Sign-up ----------

export interface SignupInput {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  city?: string;
  state?: string;
  referral_code?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

export async function signup(data: SignupInput) {
  await ensureAuthSchema();
  const email = normalizeEmail(data.email);
  const existingRow = await query("SELECT id FROM auth_users WHERE email = $1", [email]);
  if ((existingRow.rowCount ?? 0) > 0) {
    throw new AuthError(409, "Email already in use");
  }

  const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // user_service now lives in this same app, so this is a direct call
  // instead of the legacy HTTP hop to USER_SERVICE_URL — but the external
  // auth API contract (status codes, messages) is preserved exactly.
  let userId: number;
  try {
    const user = await createUser({
      first_name: data.first_name,
      last_name: data.last_name,
      email,
      phone: data.phone,
      city: data.city ?? null,
      state: data.state ?? null,
      referral_code: data.referral_code ?? null,
      emergency_contact_name: data.emergency_contact_name ?? null,
      emergency_contact_phone: data.emergency_contact_phone ?? null,
      emergency_contact_relationship: data.emergency_contact_relationship ?? null,
    });
    userId = user.id;
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 409) {
      throw new AuthError(409, e.detail);
    }
    console.error("[auth-service] user creation failed:", e);
    throw new AuthError(502, "Failed to create user profile");
  }

  const res = await query(
    "INSERT INTO auth_users (user_id, email, phone, password_hash, is_verified) VALUES ($1, $2, $3, $4, FALSE) RETURNING id",
    [userId, email, data.phone, password_hash],
  );

  return { id: res.rows[0].id, user_id: userId, email };
}

// ---------- Login ----------

async function issueTokens(userId: number, email: string, role: string) {
  await ensureAuthSchema();
  const payload: TokenPayload = { userId, email, role };
  const access_token = signAccess(payload);
  const refresh_token = signRefresh(payload);

  await query("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)", [
    userId,
    refresh_token,
    refreshExpiryDate(),
  ]);

  return { access_token, refresh_token, user_id: userId };
}

export async function login(email: string, password: string) {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const res = await query(
    "SELECT id, user_id, password_hash, is_verified, role FROM auth_users WHERE email = $1",
    [email],
  );
  if (res.rowCount === 0) {
    throw new AuthError(401, "Invalid credentials");
  }
  const user = res.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AuthError(401, "Invalid credentials");
  }
  if (!user.is_verified) {
    throw new AuthError(403, "Please verify your email before signing in");
  }

  return issueTokens(user.user_id ?? user.id, email, user.role);
}

// ---------- Refresh ----------

export async function refreshTokens(token: string) {
  await ensureAuthSchema();
  const res = await query(
    "SELECT id, user_id FROM refresh_tokens WHERE token = $1 AND revoked = FALSE AND expires_at > NOW()",
    [token],
  );
  if (res.rowCount === 0) {
    throw new AuthError(401, "Invalid refresh token");
  }
  const row = res.rows[0];
  let payload: TokenPayload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw new AuthError(401, "Invalid refresh token");
  }

  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1", [row.id]);

  const access_token = signAccess(payload);
  const new_refresh = signRefresh(payload);
  await query("INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)", [
    row.user_id,
    new_refresh,
    refreshExpiryDate(),
  ]);
  return { access_token, refresh_token: new_refresh };
}

// ---------- Forgot / Reset password ----------

export async function resetPassword(email: string, otp: string, newPassword: string) {
  await ensureAuthSchema();
  email = normalizeEmail(email);

  // Check the user exists before consuming the OTP — verifyOTP marks the code
  // used as a side effect, so doing that first would burn a valid OTP on
  // every failed attempt (e.g. a stale/wrong email), leaving the user with no
  // way to retry without requesting a brand new code.
  const userRes = await query("SELECT id FROM auth_users WHERE email = $1", [email]);
  if (userRes.rowCount === 0) {
    throw new AuthError(404, "User not found");
  }

  const valid = await verifyOTP(email, otp, "password_reset");
  if (!valid) {
    throw new AuthError(400, "Invalid or expired OTP");
  }

  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query("UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE email = $2", [
    password_hash,
    email,
  ]);
}

// ---------- Change password (authenticated) ----------

export async function changePassword(email: string, oldPassword: string, newPassword: string) {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const res = await query("SELECT password_hash FROM auth_users WHERE email = $1", [email]);
  if (res.rowCount === 0) {
    throw new AuthError(404, "User not found");
  }
  const valid = await bcrypt.compare(oldPassword, res.rows[0].password_hash);
  if (!valid) {
    throw new AuthError(400, "Current password is incorrect");
  }
  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query("UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE email = $2", [
    hash,
    email,
  ]);
}

// ---------- Verify email ----------

// Marks the account verified and immediately logs the user in — verifying the
// signup OTP is proof of email ownership, so there's no need to make them
// re-enter their password right after.
export async function completeSignupVerification(email: string) {
  await ensureAuthSchema();
  email = normalizeEmail(email);
  const res = await query("SELECT user_id, role FROM auth_users WHERE email = $1", [email]);
  if (res.rowCount === 0) {
    throw new AuthError(404, "User not found");
  }
  const { user_id, role } = res.rows[0];
  await query("UPDATE auth_users SET is_verified = TRUE WHERE email = $1", [email]);
  // Best-effort: a failure here must not block the rider from completing
  // signup — the admin dashboard's verified badge is a secondary concern
  // next to the user actually being able to use the app. Wrapped in after()
  // so Vercel keeps the function alive until this settles instead of
  // freezing the runtime once the response is sent.
  after(() =>
    updateUser(user_id, { is_verified: true }).catch((e: unknown) => {
      console.error("[auth-service] failed to sync is_verified to user module:", e);
    }),
  );
  return issueTokens(user_id, email, role);
}

// ---------- Logout ----------

export async function logout(token: string) {
  await ensureAuthSchema();
  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1", [token]);
}

// Called when an account is deleted or suspended so an already-issued
// refresh token can't keep renewing a session for an account that should no
// longer have access — deleteUser()/suspend only touch the users table,
// which refreshTokens() never checks, so without this a deleted/suspended
// user's session would otherwise keep refreshing indefinitely.
export async function revokeAllRefreshTokensForUser(userId: number): Promise<void> {
  await ensureAuthSchema();
  await query("UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE", [userId]);
}

// ---------- Waitlist ----------

export interface WaitlistInput {
  full_name: string;
  email: string;
  phone?: string;
  city?: string;
  occupation?: string;
  commute_days?: string;
  challenge?: string;
  preference?: string;
}

export async function joinWaitlist(data: WaitlistInput) {
  await ensureAuthSchema();
  const email = normalizeEmail(data.email);
  const existing = await query("SELECT id FROM waitlist_entries WHERE email = $1", [email]);
  if ((existing.rowCount ?? 0) > 0) {
    throw new AuthError(409, "You're already on the waitlist");
  }

  const res = await query(
    `INSERT INTO waitlist_entries (full_name, email, phone, city, occupation, commute_days, challenge, preference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      data.full_name,
      email,
      data.phone ?? null,
      data.city ?? null,
      data.occupation ?? null,
      data.commute_days ?? null,
      data.challenge ?? null,
      data.preference ?? null,
    ],
  );

  after(() => sendWaitlistNotification({ email, full_name: data.full_name }).catch(() => {}));

  return { id: res.rows[0].id, email };
}
