import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { applyReferral } from "@/modules/rewards/repository";
import { applyReferralSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/apply
export async function POST(request: NextRequest) {
  try {
    const body = applyReferralSchema.parse(await request.json());
    const result = await applyReferral(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
