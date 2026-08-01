import { NextResponse } from "next/server";

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
export function authErrorResponse(error: unknown, defaultStatus = 500) {
  const status = error instanceof AuthError ? error.status : defaultStatus;
  const message = error instanceof Error ? error.message : "Unknown error";
  if (!(error instanceof AuthError)) {
    console.error(error);
  }
  return NextResponse.json({ detail: message }, { status });
}
