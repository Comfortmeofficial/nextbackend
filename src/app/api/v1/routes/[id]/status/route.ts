import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { updateRouteStatus } from "@/modules/booking/repository/routes";
import { parseBookingId } from "@/modules/booking/util";
import { routeStatusInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/routes/{id}/status — marking a route inactive only stops it
// being offered for new schedules/rides going forward (see the active-only
// check in POST /rides and /ride-schedules); it never touches anything
// already generated that references this route.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { status } = routeStatusInputSchema.parse(await request.json());
    const route = await updateRouteStatus(id, status);
    recordAuditLog(actor, request, "UPDATE", "route", id, { status });
    return NextResponse.json(route);
  } catch (error) {
    return handleRouteError(error);
  }
}
