import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/http-errors";
import type { AdminTokenPayload } from "./jwt";
import type { AdminRoleApi } from "./types";

// Mirrors RequiredHeadersMiddleware — applied only to the admin CRUD routes
// (create/list/get/update/delete), matching the source's EXCLUDED_PATHS
// which exempts login/setup/health. This is a header-presence check only,
// not authentication.
export function requireRequestId(request: NextRequest): NextResponse | null {
  if (!request.headers.get("x-request-id")) {
    return NextResponse.json({ detail: "Missing required header: x-request-id" }, { status: 400 });
  }
  return null;
}

const SECRET = process.env.ADMIN_JWT_SECRET || "change_me_in_production";

// Verifies the admin bearer token issued by /api/v1/admin/auth/login and,
// if `allowedRoles` is given, checks the token's role is one of them.
// Throws ApiError (401 for missing/invalid token, 403 for a valid token
// with the wrong role) — callers let handleRouteError() turn that into a
// response, same pattern as booking/guard.ts's requireDriverAuth.
export function requireAdminAuth(
  request: NextRequest,
  allowedRoles?: AdminRoleApi[],
): AdminTokenPayload {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new ApiError(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  let claims: AdminTokenPayload;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === "string" || !decoded.role || !decoded.sub) {
      throw new Error("unexpected token payload");
    }
    claims = decoded as unknown as AdminTokenPayload;
  } catch {
    throw new ApiError(401, "invalid or expired token");
  }

  if (allowedRoles && !allowedRoles.includes(claims.role as AdminRoleApi)) {
    throw new ApiError(403, "You don't have permission to perform this action");
  }

  return claims;
}

// Accepts either a Vercel Cron request (a shared-secret bearer token, if
// CRON_SECRET is configured) or a normal admin token with an allowed role —
// lets the ride-generation endpoint be triggered by an actual cron job AND
// opportunistically from the Schedules admin page, without either path
// needing its own separate endpoint.
export function requireCronOrAdminAuth(request: NextRequest, allowedRoles?: AdminRoleApi[]): void {
  const header = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && header === `Bearer ${cronSecret}`) return;
  requireAdminAuth(request, allowedRoles);
}

// Reasonable first-pass role tiers — sketched, not yet confirmed against
// real org policy. super_admin and admin both get full operational access;
// the only thing admin can't do is manage other admin accounts, matching
// the one restriction the dashboard's own sidebar already encodes
// (Administration > Admins is super_admin-only there too).
export const SUPER_ADMIN_ONLY: AdminRoleApi[] = ["super_admin"];
export const FULL_ACCESS: AdminRoleApi[] = ["super_admin", "admin"];
export const OPS_ROLES: AdminRoleApi[] = ["super_admin", "admin", "operations_manager"];
export const FINANCE_ROLES: AdminRoleApi[] = ["super_admin", "admin", "finance_officer"];
export const SUPPORT_ROLES: AdminRoleApi[] = ["super_admin", "admin", "customer_support"];
export const MARSHAL_ROLES: AdminRoleApi[] = ["super_admin", "admin", "bus_marshal"];
export const OPS_OR_MARSHAL_ROLES: AdminRoleApi[] = [
  "super_admin",
  "admin",
  "operations_manager",
  "bus_marshal",
];
