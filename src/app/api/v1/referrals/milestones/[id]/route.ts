import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { FINANCE_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { deleteMilestone, updateMilestone } from "@/modules/rewards/repository";
import { idParamSchema } from "@/modules/rewards/validation";
import { referralMilestoneUpdateSchema } from "@/modules/rewards/validation";

type Params = { params: Promise<{ id: string }> };

// PUT /api/v1/referrals/milestones/{id}
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const id = idParamSchema.parse((await params).id);
    const body = referralMilestoneUpdateSchema.parse(await request.json());
    const milestone = await updateMilestone(id, body);
    return NextResponse.json(milestone);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/referrals/milestones/{id}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, FINANCE_ROLES);
    const id = idParamSchema.parse((await params).id);
    await deleteMilestone(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
