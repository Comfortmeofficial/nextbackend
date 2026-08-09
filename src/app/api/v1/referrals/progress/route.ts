import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getReferralProgress } from "@/modules/rewards/repository";
import { progressQuerySchema } from "@/modules/rewards/validation";

// GET /api/v1/referrals/progress?user_id=... — the user's own referral
// use_count against the admin-configured milestone ladder.
export async function GET(request: NextRequest) {
  try {
    const { user_id } = progressQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const progress = await getReferralProgress(user_id);
    return NextResponse.json(progress);
  } catch (error) {
    return handleRouteError(error);
  }
}
