import { NextResponse } from "next/server";

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
  console.error(error);
  return new NextResponse(null, { status: fallback });
}
