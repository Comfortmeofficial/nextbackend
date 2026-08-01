import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { refreshTokens } from "@/modules/auth/service";

// POST /api/v1/auth/refresh — the only route whose success body has no
// top-level "message", and whose error fallback defaults to 401, not 500.
export async function POST(request: NextRequest) {
  const { refresh_token } = await request.json();
  if (!refresh_token) {
    return NextResponse.json({ detail: "refresh_token is required" }, { status: 400 });
  }
  try {
    const tokens = await refreshTokens(refresh_token);
    return NextResponse.json({ data: tokens });
  } catch (error) {
    return authErrorResponse(error, 401);
  }
}
