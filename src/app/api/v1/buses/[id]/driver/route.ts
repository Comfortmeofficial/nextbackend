import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { busErrorResponse } from "@/modules/buses/errors";
import { assignDriver, unassignDriver } from "@/modules/buses/repository";
import { assignDriverSchema, parseBusId } from "@/modules/buses/validation";
import { assertDriverAssignable } from "@/modules/drivers/repository";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/buses/{id}/driver
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const { driver_id } = assignDriverSchema.parse(await request.json());
    await assertDriverAssignable(driver_id);
    const bus = await assignDriver(id, driver_id);
    recordAuditLog(actor, request, "UPDATE", "bus", id, { driver_id });
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}

// DELETE /api/v1/buses/{id}/driver
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const bus = await unassignDriver(id);
    recordAuditLog(actor, request, "UPDATE", "bus", id, { driver_id: null });
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}
