import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { locationRepo } from "@/modules/booking/repository/places";
import { placeInputSchema } from "@/modules/booking/validation";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const loc = await locationRepo.getById(id);
    return NextResponse.json(loc);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const body = placeInputSchema.parse(await request.json());
    const loc = await locationRepo.update(id, body);
    recordAuditLog(actor, request, "UPDATE", "location", id, body);
    return NextResponse.json(loc);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await locationRepo.delete(id);
    recordAuditLog(actor, request, "DELETE", "location", id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
