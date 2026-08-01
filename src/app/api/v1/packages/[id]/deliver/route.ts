import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { requireDriverAuth } from "@/modules/booking/guard";
import { getPackage, getPackageRow, updatePackageStatus } from "@/modules/booking/repository/packages";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";
import { deliverPackageInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/packages/{id}/deliver — driver-authenticated: the driver
// types in the OTP the recipient relays to them verbally to confirm handoff.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const driverId = requireDriverAuth(request);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const { otp } = deliverPackageInputSchema.parse(await request.json());

    const pkg = await getPackageRow(id);
    if (!pkg) {
      throw new ApiError(404, "Package not found");
    }
    const ride = await getRideRow(pkg.ride_id);
    if (!ride || ride.driver_id !== driverId) {
      throw new ApiError(403, "You are not assigned to this ride");
    }
    if (pkg.status !== "pending_pickup" && pkg.status !== "in_transit") {
      throw new ApiError(400, "Package is not awaiting delivery");
    }
    if (pkg.delivery_otp !== otp) {
      throw new ApiError(400, "Invalid delivery code");
    }

    await updatePackageStatus(id, "delivered");
    const updated = await getPackage(id);
    delete updated.delivery_otp;
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
