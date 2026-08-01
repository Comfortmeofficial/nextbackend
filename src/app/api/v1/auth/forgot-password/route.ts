import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { sendOTP } from "@/modules/auth/service";

// POST /api/v1/auth/forgot-password
export async function POST(request: NextRequest) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ detail: "email is required" }, { status: 400 });
  }
  try {
    await sendOTP(email, "password_reset");
    return NextResponse.json({ message: "Password reset OTP sent" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
