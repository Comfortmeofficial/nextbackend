import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { getRideRow, updateRideStatus } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/rides/{id}/end-trip — the marshal-facing counterpart to the
// existing ops-only PATCH /rides/{id}/status: marshals can't use that
// endpoint (MARSHAL_ROLES is deliberately excluded from OPS_ROLES), but
// they're the ones actually present when a trip genuinely ends, so this
// gives them a scoped way to close it out themselves. Same
// bus_marshal-ownership check as GET /rides/{id}/passengers.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const claims = requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    const ride = await getRideRow(id);
    if (!ride) throw new ApiError(404, "Ride not found");

    if (claims.role === "bus_marshal" && ride.marshal_admin_id !== Number(claims.sub)) {
      throw new ApiError(403, "You are not assigned to this ride");
    }
    if (ride.status !== "active" && ride.status !== "boarding") {
      throw new ApiError(400, `Cannot end a trip that is ${ride.status}`);
    }

    const updated = await updateRideStatus(id, "completed");
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
