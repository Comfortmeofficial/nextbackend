import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/http-errors";
import { decodeToken } from "./jwt";
import { findActiveById, toDto } from "./repository";
import type { DriverDto } from "./types";

// Mirrors dependencies.py::get_current_driver — the only route in this
// service that actually enforces bearer auth (every other driver route has
// none, matching the rest of this platform today).
//
// The first two checks reproduce FastAPI's HTTPBearer security dependency
// itself, which runs (and can reject the request) before get_current_driver's
// own body ever executes — and it uses 403, not 401, for a missing or
// malformed header. Only a present-but-invalid *token* is a 401, raised by
// get_current_driver's own code. Getting this split right matters because
// it's observable behavior any client handling 401 vs 403 differently would
// depend on.
export async function getCurrentDriver(request: NextRequest): Promise<DriverDto> {
  const header = request.headers.get("authorization");
  const [scheme, token] = (header ?? "").split(" ");
  if (!header || !scheme || !token) {
    throw new ApiError(403, "Not authenticated");
  }
  if (scheme.toLowerCase() !== "bearer") {
    throw new ApiError(403, "Invalid authentication credentials");
  }

  let driverId: number;
  try {
    driverId = decodeToken(token, "access");
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const row = await findActiveById(driverId);
  if (!row || !row.is_active) {
    throw new ApiError(401, "Driver not found or inactive");
  }
  return toDto(row);
}
