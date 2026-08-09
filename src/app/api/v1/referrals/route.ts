import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { createReferralCode, listReferralCodes } from "@/modules/rewards/repository";
import { listQuerySchema, referralCodeCreateSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const body = referralCodeCreateSchema.parse(await request.json());
    const referral = await createReferralCode(body);
    return NextResponse.json(referral, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/referrals/?skip=0&limit=100 — admin-only listing (mobile
// uses /referrals/mine for a user's own code); not called by mobile.
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const { skip, limit } = listQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const referrals = await listReferralCodes(skip, limit);
    return NextResponse.json(referrals);
  } catch (error) {
    return handleRouteError(error);
  }
}
