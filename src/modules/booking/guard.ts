import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/http-errors";
import { MARSHAL_ROLES } from "@/modules/admin/guard";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { getRideRow } from "./repository/rides";
import type { BookingRow } from "./types";

// Mirrors handler/driverauth.go's RequireDriverAuth — a separate,
// hand-rolled Gin middleware distinct from driver_service's own FastAPI
// HTTPBearer guard (src/modules/drivers/guard.ts). Deliberately NOT reusing
// that guard: this one always responds 401 (never 403) with its own set of
// messages, which is a real, observable difference from the other one.
// Reuses the same DRIVER_JWT_SECRET value, though — both verify the same
// driver-portal access tokens issued by the drivers module.
const SECRET = process.env.DRIVER_JWT_SECRET || "change_me_in_production";

export function requireDriverAuth(request: NextRequest): number {
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

  if (claims.type !== "access") {
    throw new ApiError(401, "wrong token type");
  }
  const driverId = Number(claims.sub);
  if (!Number.isFinite(driverId) || !/^\d+$/.test(String(claims.sub ?? ""))) {
    throw new ApiError(401, "invalid token subject");
  }
  return driverId;
}

// board/complete are called by two legitimate actors sharing one endpoint —
// the rider themself (self-service, scanning the driver's code) and the
// ride's assigned marshal (scanning the rider's own booking QR) — so this
// resolves identity the same way rides/[id]/chat/[userId]/messages's
// resolveSender does: try an admin (marshal) token first, fall through to a
// customer token otherwise.
const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || "change_me_in_production";

export async function requireBoardingActor(
  request: NextRequest,
  booking: BookingRow,
): Promise<"customer" | "marshal"> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new ApiError(401, "missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    if (typeof decoded !== "string" && MARSHAL_ROLES.includes(decoded.role)) {
      if (decoded.role === "bus_marshal") {
        const ride = await getRideRow(booking.ride_id);
        if (!ride || ride.marshal_admin_id !== Number(decoded.sub)) {
          throw new ApiError(403, "You are not assigned to this ride");
        }
      }
      return "marshal";
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Not a valid admin token — fall through and try customer auth below.
  }

  const userId = requireCustomerAuth(request);
  if (booking.user_id !== userId) {
    throw new ApiError(403, "Not your booking");
  }
  return "customer";
}
