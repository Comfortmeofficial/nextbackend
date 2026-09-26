import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse } from "@/modules/auth/errors";
import { verifyOTP, revokeAllRefreshTokensForUser } from "@/modules/auth/service";
import { deleteUser, getUserByEmail } from "@/modules/users/repository";

// POST /api/v1/auth/delete-account — the website's self-service deletion
// flow, for anyone who wants to delete their account without opening the
// app: send-otp with purpose "account_deletion" first, then this consumes
// that code and deletes the account in one step. No bearer token needed —
// proving control of the account's email via OTP is the identity check,
// same trust level the app's own logged-in DELETE /users/{id} relies on.
export async function POST(request: NextRequest) {
  const { email, otp } = await request.json();
  if (!email || !otp) {
    return NextResponse.json({ detail: "email and otp are required" }, { status: 400 });
  }
  try {
    const valid = await verifyOTP(email, otp, "account_deletion");
    if (!valid) {
      return NextResponse.json({ detail: "Invalid or expired code" }, { status: 400 });
    }
    const user = await getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ detail: "No Comfortme account found for this email" }, { status: 404 });
    }
    await deleteUser(user.id);
    await revokeAllRefreshTokensForUser(user.id);
    return NextResponse.json({ message: "Account deleted" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
