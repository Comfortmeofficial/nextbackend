import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/http-errors";

// The first real per-customer auth check in this API — everything else
// customer-facing today trusts a user_id passed in the request body/query
// with no verification it matches the caller's own token. Scoped narrowly
// to trip chat for now: that's 1:1 private messaging, the one place an
// unverified user_id is a direct privacy leak rather than a self-service
// convenience.
const SECRET = process.env.JWT_SECRET || "change_me_in_production";

export function requireCustomerAuth(request: NextRequest): number {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new ApiError(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  let claims: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === "string") throw new Error("unexpected string payload");
    claims = decoded;
  } catch {
    throw new ApiError(401, "invalid or expired token");
  }

  const userId = Number(claims.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(401, "invalid token subject");
  }
  return userId;
}
