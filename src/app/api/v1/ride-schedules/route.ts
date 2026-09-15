import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { createRideSchedule, listRideSchedules } from "@/modules/booking/repository/ride-schedules";
import { getRoute } from "@/modules/booking/repository/routes";
import { rideScheduleInputSchema } from "@/modules/booking/validation";

// POST /api/v1/ride-schedules
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdminAuth(request, OPS_ROLES);
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
    const schedule = await createRideSchedule(input);
    recordAuditLog(actor, request, "CREATE", "ride_schedule", schedule.id, input);
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/ride-schedules — unguarded list, matching GET /rides and GET /routes.
export async function GET() {
  try {
    const schedules = await listRideSchedules();
    return NextResponse.json(schedules);
  } catch (error) {
    return handleRouteError(error);
  }
}
