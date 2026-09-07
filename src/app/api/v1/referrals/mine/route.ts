import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { getOrCreateMyReferralCode } from "@/modules/rewards/repository";
import { mineQuerySchema } from "@/modules/rewards/validation";

// GET /api/v1/referrals/mine?user_id=...
export async function GET(request: NextRequest) {
  try {
    const { user_id } = mineQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (requireCustomerAuth(request) !== user_id) {
      throw new ApiError(403, "Not your referral code");
    }
    const referral = await getOrCreateMyReferralCode(user_id);
    return NextResponse.json(referral);
  } catch (error) {
    return handleRouteError(error);
  }
}
