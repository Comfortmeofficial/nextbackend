import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { convertReferral } from "@/modules/rewards/repository";
import { convertReferralSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/convert
export async function POST(request: NextRequest) {
  try {
    const body = convertReferralSchema.parse(await request.json());
    const result = await convertReferral(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
