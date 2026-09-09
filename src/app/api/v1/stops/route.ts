import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { stopRepo } from "@/modules/booking/repository/places";
import { listQuerySchema, placeInputSchema } from "@/modules/booking/validation";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const body = placeInputSchema.parse(await request.json());
    const stop = await stopRepo.create(body);
    recordAuditLog(actor, request, "CREATE", "stop", stop.id, { name: body.name });
    return NextResponse.json(stop, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { skip, limit } = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await stopRepo.list(skip, limit);
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
