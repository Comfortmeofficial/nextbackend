import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import {
  deleteRideSchedule,
  getRideSchedule,
  updateRideSchedule,
} from "@/modules/booking/repository/ride-schedules";
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
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const input = rideScheduleInputSchema.parse(await request.json());
    const schedule = await updateRideSchedule(id, input);
    return NextResponse.json(schedule);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/ride-schedules/{id} — stops future generation only.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await deleteRideSchedule(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
