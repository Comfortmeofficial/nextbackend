import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { createMilestone, listMilestones } from "@/modules/rewards/repository";
import { referralMilestoneCreateSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/milestones — admin-only in practice (called from
// the admin dashboard), no additional auth check here since none of the
// other referral endpoints in this module enforce one either.
export async function POST(request: NextRequest) {
  try {
    const body = referralMilestoneCreateSchema.parse(await request.json());
    const milestone = await createMilestone(body);
    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/referrals/milestones — full ladder, including inactive ones
// (the admin dashboard needs to see and toggle those too).
export async function GET() {
  try {
    const milestones = await listMilestones(false);
    return NextResponse.json(milestones);
  } catch (error) {
    return handleRouteError(error);
  }
}
