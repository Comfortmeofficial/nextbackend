import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { stopRepo } from "@/modules/booking/repository/places";
import { placeInputSchema } from "@/modules/booking/validation";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const stop = await stopRepo.getById(id);
    return NextResponse.json(stop);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const body = placeInputSchema.parse(await request.json());
    const stop = await stopRepo.update(id, body);
    recordAuditLog(actor, request, "UPDATE", "stop", id, body);
    return NextResponse.json(stop);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await stopRepo.delete(id);
    recordAuditLog(actor, request, "DELETE", "stop", id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
