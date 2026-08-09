import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { assignBus, unassignBus } from "@/modules/drivers/repository";
import { assignBusSchema } from "@/modules/drivers/validation";
import { idParamSchema } from "@/lib/common-validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/drivers/{driver_id}/assign-bus
export async function POST(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const { bus_id } = assignBusSchema.parse(await request.json());
    const driver = await assignBus(id, bus_id);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/drivers/{driver_id}/assign-bus
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = idParamSchema.parse((await params).id);
    const driver = await unassignBus(id);
    return NextResponse.json(driver);
  } catch (error) {
    return handleRouteError(error);
  }
}
