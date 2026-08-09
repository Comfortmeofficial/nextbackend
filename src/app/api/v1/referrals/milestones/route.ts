import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { createMilestone, listMilestones } from "@/modules/rewards/repository";
import { referralMilestoneCreateSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/milestones — admin-only (called from the admin
// dashboard). Not to be confused with /referrals/milestones/claim, which
// is a customer-facing action and stays ungated by admin auth.
export async function POST(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const body = referralMilestoneCreateSchema.parse(await request.json());
    const milestone = await createMilestone(body);
    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/referrals/milestones — full ladder, including inactive ones
// (the admin dashboard needs to see and toggle those too).
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const milestones = await listMilestones(false);
    return NextResponse.json(milestones);
  } catch (error) {
    return handleRouteError(error);
  }
}
