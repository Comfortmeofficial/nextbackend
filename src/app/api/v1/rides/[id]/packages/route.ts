import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireDriverAuth } from "@/modules/booking/guard";
import { getRideRow } from "@/modules/booking/repository/rides";
import { listPackagesByRide } from "@/modules/booking/repository/packages";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/rides/{id}/packages — driver-authenticated: the driver's own
// view of packages riding along on their current ride. delivery_otp is
// scrubbed from every item (the driver only ever learns it verbally from
// the recipient at drop-off).
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const driverId = requireDriverAuth(request);
    const rideId = parseBookingId((await params).id);
    if (typeof rideId !== "number") return rideId;

    const ride = await getRideRow(rideId);
    if (!ride) {
      throw new ApiError(404, "Ride not found");
    }
    if (ride.driver_id !== driverId) {
      throw new ApiError(403, "You are not assigned to this ride");
    }

    const items = await listPackagesByRide(rideId);
    for (const item of items) delete item.delivery_otp;
    return NextResponse.json(items);
  } catch (error) {
    return handleRouteError(error);
  }
}
