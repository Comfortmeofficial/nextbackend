import { NextResponse } from "next/server";
import { ApiError } from "@/lib/http-errors";

// bus_service's Axum handlers return Result<_, StatusCode> — the error arm
// serializes to just a status code and an EMPTY body, not the {"detail":...}
// JSON envelope every other (FastAPI/Express-derived) service in this app
// uses. Deliberately not reusing the shared ApiError/handleRouteError here:
// they'd add a JSON body this service never sent.
export class BusError extends Error {
  constructor(public readonly status: number) {
    super(`bus_service error ${status}`);
  }
}

export function busErrorResponse(error: unknown, fallback = 500) {
  if (error instanceof BusError) {
    return new NextResponse(null, { status: error.status });
  }
  // requireAdminAuth (shared across every admin-gated route) throws
  // ApiError, not BusError — still map it to bus_service's empty-body
  // convention rather than leaking a mismatched JSON error shape here.
  if (error instanceof ApiError) {
    return new NextResponse(null, { status: error.status });
  }
  console.error(error);
  return new NextResponse(null, { status: fallback });
}
