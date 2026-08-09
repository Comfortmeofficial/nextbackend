import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { claimMilestone } from "@/modules/rewards/repository";
import { claimMilestoneSchema } from "@/modules/rewards/validation";

// POST /api/v1/referrals/milestones/claim
export async function POST(request: NextRequest) {
  try {
    const body = claimMilestoneSchema.parse(await request.json());
    const result = await claimMilestone(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
