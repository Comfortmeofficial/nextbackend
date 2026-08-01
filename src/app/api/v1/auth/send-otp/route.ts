import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { sendOTP } from "@/modules/auth/service";

// POST /api/v1/auth/send-otp
export async function POST(request: NextRequest) {
  const { email, purpose } = await request.json();
  if (!email || !purpose) {
    return NextResponse.json({ detail: "email and purpose are required" }, { status: 400 });
  }
  try {
    await sendOTP(email, purpose);
    return NextResponse.json({ message: "OTP sent" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
