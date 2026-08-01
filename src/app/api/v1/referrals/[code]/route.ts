import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { deactivateReferralCode, getReferralCode } from "@/modules/rewards/repository";
import { idParamSchema } from "@/modules/rewards/validation";

type Params = { params: Promise<{ code: string }> };

// GET /api/v1/referrals/{code} — code is an opaque string, not an id.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { code } = await params;
    const referral = await getReferralCode(code);
    return NextResponse.json(referral);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/referrals/{code_id} — same path shape, but this segment is
// the numeric id (the legacy service names it differently per-route too).
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const codeId = idParamSchema.parse((await params).code);
    await deactivateReferralCode(codeId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
