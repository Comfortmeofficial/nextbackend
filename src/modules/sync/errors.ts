import { NextResponse } from "next/server";

// Same convention as buses/errors.ts: this is another Axum service whose
// Result<_, StatusCode> handlers produce an empty response body on error,
// not the {"detail": ...} envelope used elsewhere. Kept as its own small
// module-local copy rather than sharing bus_service's, to avoid touching
// that already-verified module for a cosmetic dedup.
export class SyncError extends Error {
  constructor(public readonly status: number) {
    super(`sync error ${status}`);
  }
}

export function syncErrorResponse(error: unknown, fallback = 500) {
  if (error instanceof SyncError) {
    return new NextResponse(null, { status: error.status });
  }
  console.error(error);
  return new NextResponse(null, { status: fallback });
}
