import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/http-errors";
import type { AdminRoleApi } from "@/modules/admin/types";

// Real per-customer auth check, verifying the caller's own JWT (issued at
// /auth/login) rather than trusting a user_id passed in the request
// body/query. Originally scoped narrowly to trip chat; now the standard
// guard for every customer-owned resource route.
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

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || "change_me_in_production";

// Resource routes reachable by both an admin/ops actor and the resource's
// own customer (a booking's own rider looked up by an agent, a rental's
// own requester, a user's own profile edited by support) — try an admin
// token with an allowed role first, then fall back to a customer token
// that must match the resource's owner. Generalizes the same try-admin-
// then-fall-through shape booking/guard.ts's requireBoardingActor already
// uses for board/complete, without that function's ride-assignment check
// (callers that need a narrower per-resource admin check, like a marshal
// only seeing their own assigned ride, still do that themselves).
export function requireOwnerOrAdmin(
  request: NextRequest,
  ownerUserId: number,
  adminRoles: AdminRoleApi[],
  ownerErrorMessage = "Not your own resource",
): "customer" | "admin" {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    try {
      const decoded = jwt.verify(token, ADMIN_SECRET);
      if (typeof decoded !== "string" && decoded.role && adminRoles.includes(decoded.role as AdminRoleApi)) {
        return "admin";
      }
    } catch {
      // Not a valid admin token — fall through and try customer auth below.
    }
  }

  const userId = requireCustomerAuth(request);
  if (userId !== ownerUserId) {
    throw new ApiError(403, ownerErrorMessage);
  }
  return "customer";
}
