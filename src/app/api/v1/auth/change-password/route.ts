import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { changePassword } from "@/modules/auth/service";

// POST /api/v1/auth/change-password — proof of identity is the current
// password itself, not a bearer token (matches the rest of the platform's
// largely-unenforced auth today).
export async function POST(request: NextRequest) {
  const { email, current_password, new_password } = await request.json();
  if (!email || !current_password || !new_password) {
    return NextResponse.json(
      { detail: "email, current_password and new_password are required" },
      { status: 400 },
    );
  }
  try {
    await changePassword(email, current_password, new_password);
    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
