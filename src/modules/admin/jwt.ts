import jwt from "jsonwebtoken";

// The source's own env var is also literally named JWT_SECRET — same
// naming collision already handled for driver tokens. Unlike driver JWTs,
// nothing else in this platform currently verifies admin tokens (the
// admin_service CRUD routes don't even check them server-side — see
// guard.ts), so there's no cross-service value to keep in sync; this just
// needs its own name to avoid colliding with the customer JWT_SECRET
// already claimed in this process.
const SECRET = process.env.ADMIN_JWT_SECRET || "change_me_in_production";
const ACCESS_TTL_MINUTES = 60 * 24; // 24 hours

export interface AdminTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export function createAccessToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: `${ACCESS_TTL_MINUTES}m` });
}

export const ACCESS_TOKEN_TTL_SECONDS = ACCESS_TTL_MINUTES * 60;
