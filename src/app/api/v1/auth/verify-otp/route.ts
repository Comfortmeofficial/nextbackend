import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { checkOTP, completeSignupVerification, verifyOTP } from "@/modules/auth/service";

// POST /api/v1/auth/verify-otp
export async function POST(request: NextRequest) {
  const { email, otp, purpose } = await request.json();
  if (!email || !otp || !purpose) {
    return NextResponse.json({ detail: "email, otp and purpose are required" }, { status: 400 });
  }
  try {
    const valid =
      purpose === "password_reset"
        ? await checkOTP(email, otp, purpose)
        : await verifyOTP(email, otp, purpose);
    if (!valid) {
      return NextResponse.json({ detail: "Invalid or expired OTP" }, { status: 400 });
    }
    if (purpose === "signup") {
      const tokens = await completeSignupVerification(email);
      return NextResponse.json({ message: "OTP verified successfully", data: tokens });
    }
    return NextResponse.json({ message: "OTP verified successfully" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
