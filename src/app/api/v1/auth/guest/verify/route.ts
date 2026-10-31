import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { verifyGuestSession } from "@/modules/auth/service";

// POST /api/v1/auth/guest/verify — second step when POST /auth/guest came
// back { requires_verification: true }: consumes the OTP sent via
// send-otp (purpose "guest_checkout_verify") and, if valid, issues a real
// session for that existing account.
export async function POST(request: NextRequest) {
  const { email, otp } = await request.json();
  if (!email || !otp) {
    return NextResponse.json({ detail: "email and otp are required" }, { status: 400 });
  }
  try {
    const result = await verifyGuestSession(email, otp);
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
