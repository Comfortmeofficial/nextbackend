import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/modules/auth/service";

// POST /api/v1/auth/logout — refresh_token is optional and there's no error
// path at all; always 200, even for a missing/invalid/already-revoked token.
export async function POST(request: NextRequest) {
  const { refresh_token } = await request.json();
  if (refresh_token) {
    await logout(refresh_token);
  }
  return NextResponse.json({ message: "Logged out successfully" });
}
