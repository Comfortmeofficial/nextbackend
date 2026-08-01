import jwt from "jsonwebtoken";
import { randomInt, randomUUID } from "node:crypto";

const ACCESS_SECRET = process.env.JWT_SECRET || "change_me_in_production";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh_change_me";
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
}

// A jti (JWT ID nonce) is added so two tokens signed with identical claims
// within the same second — e.g. login immediately followed by a refresh —
// don't come out byte-identical. refresh_tokens.token is UNIQUE, and without
// this, jsonwebtoken's one-second iat resolution plus otherwise-identical
// payload/expiresIn made that a real, reachable collision, not just a
// theoretical one — it fired on the very first back-to-back test.
export function signAccess(payload: TokenPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefresh(payload: TokenPayload): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

// jwt.verify() returns the full decoded payload, including the token's own
// iat/exp claims — not just {userId, email, role}. The legacy service passed
// that raw object straight back into jwt.sign(..., {expiresIn}) to mint new
// tokens, which jsonwebtoken rejects outright ("payload already has an exp
// property"), meaning /refresh always threw. Stripping the JWT-standard
// claims here makes verifyRefresh's return value match what its own type
// signature always promised, and fixes that crash.
export function verifyRefresh(token: string): TokenPayload {
  const decoded = jwt.verify(token, REFRESH_SECRET) as jwt.JwtPayload & TokenPayload;
  const { userId, email, role } = decoded;
  return { userId, email, role };
}

export function generateOTP(length = 6): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[randomInt(digits.length)];
  }
  return otp;
}

export function refreshExpiryDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}
