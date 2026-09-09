import { NextRequest, NextResponse } from "next/server";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { busErrorResponse } from "@/modules/buses/errors";
import { assignMarshalToBus } from "@/modules/buses/repository";
import { assignMarshalSchema, parseBusId } from "@/modules/buses/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/buses/{id}/marshals — a bus can have any number of marshals,
// unlike driver (one, via /{id}/driver); repeat-assigning the same marshal
// is a no-op (ON CONFLICT DO NOTHING in the repository).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBusId((await params).id);
    const { marshal_id } = assignMarshalSchema.parse(await request.json());
    const bus = await assignMarshalToBus(id, marshal_id);
    recordAuditLog(actor, request, "UPDATE", "bus", id, { marshal_id, action: "assign_marshal" });
    return NextResponse.json(bus);
  } catch (error) {
    return busErrorResponse(error);
  }
}
