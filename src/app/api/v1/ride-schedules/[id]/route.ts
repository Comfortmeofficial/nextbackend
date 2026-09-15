import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import {
  deleteRideSchedule,
  getRideSchedule,
  updateRideSchedule,
} from "@/modules/booking/repository/ride-schedules";
import { getRoute } from "@/modules/booking/repository/routes";
import { parseBookingId } from "@/modules/booking/util";
import { rideScheduleInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/ride-schedules/{id}
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const schedule = await getRideSchedule(id);
    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}

// PATCH /api/v1/ride-schedules/{id} — edits the schedule's own fields only;
// never touches rides already generated from it.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const input = rideScheduleInputSchema.parse(await request.json());
    if (input.stop_fares.length > 0) {
      const route = await getRoute(input.route_id);
      const routeStopIds = new Set(route.stops.map((s) => s.stop_id));
      for (const sf of input.stop_fares) {
        if (!routeStopIds.has(sf.stop_id)) {
          throw new ApiError(400, `stop ${sf.stop_id} is not one of route ${route.id}'s stops`);
        }
      }
    }
    const schedule = await updateRideSchedule(id, input);
    recordAuditLog(actor, request, "UPDATE", "ride_schedule", id, input);
    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/ride-schedules/{id} — stops future generation only.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await deleteRideSchedule(id);
    recordAuditLog(actor, request, "DELETE", "ride_schedule", id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
