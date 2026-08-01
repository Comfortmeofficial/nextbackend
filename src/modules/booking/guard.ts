import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/http-errors";

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
