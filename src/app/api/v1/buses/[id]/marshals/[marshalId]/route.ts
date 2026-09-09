import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { busErrorResponse } from "@/modules/buses/errors";
import { unassignMarshalFromBus } from "@/modules/buses/repository";
import { parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string; marshalId: string }> };

// DELETE /api/v1/buses/{id}/marshals/{marshalId}
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const { id: rawId, marshalId: rawMarshalId } = await params;
    const id = parseBusId(rawId);
    const marshalId = parseBusId(rawMarshalId);
    const bus = await unassignMarshalFromBus(id, marshalId);
    recordAuditLog(actor, request, "UPDATE", "bus", id, { marshal_id: marshalId, action: "unassign_marshal" });
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}
