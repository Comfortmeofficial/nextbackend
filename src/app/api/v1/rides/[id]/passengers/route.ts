import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listPassengersForRide } from "@/modules/booking/repository/bookings";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/rides/{id}/passengers — ops/admin see any ride; a bus_marshal
// only sees the ride(s) they're actually assigned to conduct.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const claims = requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    if (claims.role === "bus_marshal") {
      const ride = await getRideRow(id);
      if (!ride || ride.marshal_admin_id !== Number(claims.sub)) {
        throw new ApiError(403, "You are not assigned to this ride");
      }
    }

    const passengers = await listPassengersForRide(id);
    return NextResponse.json(passengers);
  } catch (error) {
    return handleRouteError(error);
  }
}
