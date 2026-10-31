import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { startGuestSession, type GuestCheckoutInput } from "@/modules/auth/service";

// POST /api/v1/auth/guest — the website's no-account checkout entry point.
// Returns either a real session (same shape as /auth/login) or
// { requires_verification: true } if this email already has a password
// account, in which case the client sends an OTP (purpose
// "guest_checkout_verify") and calls POST /auth/guest/verify instead.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<GuestCheckoutInput>;
  const { first_name, last_name, email, phone } = body;
  if (!first_name || !last_name || !email || !phone) {
    return NextResponse.json(
      { detail: "first_name, last_name, email and phone are required" },
      { status: 400 },
    );
  }
  try {
    const result = await startGuestSession(body as GuestCheckoutInput);
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
