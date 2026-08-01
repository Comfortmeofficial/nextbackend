import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Mirrors FastAPI's error envelopes so existing clients (admin_web_app's
 * axios interceptors, etc.) that read `error.response.data.detail` keep
 * working unchanged after a service is strangled into this app.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
  }
}

export function errorResponse(error: ApiError) {
  return NextResponse.json({ detail: error.detail }, { status: error.status });
}

// Approximates Pydantic v2's 422 validation error shape:
// {"detail": [{"loc": [...], "msg": "...", "type": "..."}]}
export function validationErrorResponse(error: ZodError) {
  const detail = error.issues.map((issue) => ({
    loc: ["body", ...issue.path],
    msg: issue.message,
    type: issue.code,
  }));
  return NextResponse.json({ detail }, { status: 422 });
}

// Route handlers call this from a catch block so every endpoint fails the
// same way the FastAPI service did: HTTPException -> {"detail": "..."},
// Pydantic validation -> 422 detail array, anything else -> Starlette's
// default plain-text 500 (FastAPI does NOT wrap unhandled exceptions in
// JSON unless a handler is registered for them, which this service doesn't).
export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    return errorResponse(error);
  }
  if (error instanceof ZodError) {
    return validationErrorResponse(error);
  }
  console.error(error);
  return new NextResponse("Internal Server Error", { status: 500 });
}
