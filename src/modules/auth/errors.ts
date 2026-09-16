import { NextResponse } from "next/server";
import { ApiError } from "@/lib/http-errors";

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Mirrors the hand-rolled Express catch blocks in routes/auth.ts: every
// route does res.status(e.status || <default>).json({ detail: e.message }),
// echoing whatever message is on the caught error — including from
// unexpected exceptions — rather than a sanitized generic message. Each
// route's default differs (refresh defaults to 401, everything else 500),
// so callers pass that in explicitly.
//
// Also recognizes ApiError (the shared http-errors type other modules
// throw, e.g. requireAdminAuth's 401/403) — admin-gated auth-module routes
// mix both error types, and treating only AuthError as "has a real status"
// meant an admin-auth failure here would get reported as a misleading 500.
export function authErrorResponse(error: unknown, defaultStatus = 500) {
  const hasStatus = error instanceof AuthError || error instanceof ApiError;
  const status = hasStatus ? error.status : defaultStatus;
  const message = error instanceof Error ? error.message : "Unknown error";
  if (!hasStatus) {
    console.error(error);
  }
  return NextResponse.json({ detail: message }, { status });
}
