import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { updateRideStatus } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { rideStatusInputSchema } from "@/modules/booking/validation";
import { VALID_RIDE_STATUSES } from "@/modules/booking/types";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/rides/{id}/status — called by admin_web_app's ridesApi
// (previously missed in an earlier grep and left ungated; confirmed here
// it's genuinely admin-shaped, not driver-side).
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    requireAdminAuth(request, OPS_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { status } = rideStatusInputSchema.parse(await request.json());
    if (!VALID_RIDE_STATUSES.includes(status as (typeof VALID_RIDE_STATUSES)[number])) {
      throw new ApiError(400, `invalid ride status: ${status}`);
    }
    const ride = await updateRideStatus(id, status as (typeof VALID_RIDE_STATUSES)[number]);
    return NextResponse.json(ride);
  } catch (error) {
    return handleRouteError(error);
  }
}
