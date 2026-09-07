import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { getReferralProgress } from "@/modules/rewards/repository";
import { progressQuerySchema } from "@/modules/rewards/validation";

// GET /api/v1/referrals/progress?user_id=... — the user's own referral
// use_count against the admin-configured milestone ladder.
export async function GET(request: NextRequest) {
  try {
    const { user_id } = progressQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    if (requireCustomerAuth(request) !== user_id) {
      throw new ApiError(403, "Not your referral progress");
    }
    const progress = await getReferralProgress(user_id);
    return NextResponse.json(progress);
  } catch (error) {
    return handleRouteError(error);
  }
}
