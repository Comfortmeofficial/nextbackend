import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { applyReferral } from "@/modules/rewards/repository";
import { applyReferralSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/apply
export async function POST(request: NextRequest) {
  try {
    const body = applyReferralSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== body.user_id) {
      throw new ApiError(403, "Not your account");
    }
    const result = await applyReferral(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
