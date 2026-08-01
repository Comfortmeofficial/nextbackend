import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { getOrCreateMyReferralCode } from "@/modules/rewards/repository";
import { mineQuerySchema } from "@/modules/rewards/validation";

// GET /api/v1/referrals/mine?user_id=...
export async function GET(request: NextRequest) {
  try {
    const { user_id } = mineQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const referral = await getOrCreateMyReferralCode(user_id);
    return NextResponse.json(referral);
  } catch (error) {
    return handleRouteError(error);
  }
}
