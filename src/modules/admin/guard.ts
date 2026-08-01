import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Mirrors RequiredHeadersMiddleware — applied only to the admin CRUD routes
// (create/list/get/update/delete), matching the source's EXCLUDED_PATHS
// which exempts login/setup/health. This is a header-presence check only,
// not authentication — the CRUD routes still have no auth check at all,
// which is a real, deliberately preserved gap (see project decisions on
// auth compatibility).
export function requireRequestId(request: NextRequest): NextResponse | null {
  if (!request.headers.get("x-request-id")) {
    return NextResponse.json({ detail: "Missing required header: x-request-id" }, { status: 400 });
  }
  return null;
}
