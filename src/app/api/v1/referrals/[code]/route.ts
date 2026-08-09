import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { deactivateReferralCode, getReferralCode } from "@/modules/rewards/repository";
import { idParamSchema } from "@/modules/rewards/validation";

type Params = { params: Promise<{ code: string }> };

// GET /api/v1/referrals/{code} — code is an opaque string, not an id. Not
// called by mobile (which uses /referrals/mine), admin-only lookup.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const { code } = await params;
    const referral = await getReferralCode(code);
    return NextResponse.json(referral);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/referrals/{code_id} — same path shape, but this segment is
// the numeric id (the legacy service names it differently per-route too).
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const codeId = idParamSchema.parse((await params).code);
    await deactivateReferralCode(codeId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
