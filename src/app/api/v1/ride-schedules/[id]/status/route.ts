import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { updateRideScheduleStatus } from "@/modules/booking/repository/ride-schedules";
import { parseBookingId } from "@/modules/booking/util";
import { rideScheduleStatusInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/ride-schedules/{id}/status — pause/resume.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { status } = rideScheduleStatusInputSchema.parse(await request.json());
    const schedule = await updateRideScheduleStatus(id, status);
    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}
