import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { resetPassword } from "@/modules/auth/service";

// POST /api/v1/auth/reset-password
export async function POST(request: NextRequest) {
  const { email, otp, new_password } = await request.json();
  if (!email || !otp || !new_password) {
    return NextResponse.json(
      { detail: "email, otp and new_password are required" },
      { status: 400 },
    );
  }
  try {
    await resetPassword(email, otp, new_password);
    return NextResponse.json({ message: "Password reset successfully" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
