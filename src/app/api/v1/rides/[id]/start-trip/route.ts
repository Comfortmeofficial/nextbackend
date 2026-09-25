import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { getRideRow, updateRideStatus } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/rides/{id}/start-trip — the marshal-facing way to explicitly
// start a ride, counterpart to end-trip. Boarding the first passenger also
// starts a ride (see markOnBoard), but a marshal needs to be able to depart
// deliberately — e.g. with everyone already seated, or nobody scanned yet.
// Same bus_marshal-ownership check as end-trip and GET /rides/{id}/passengers.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const claims = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    const ride = await getRideRow(id);
    if (!ride) throw new ApiError(404, "Ride not found");

    if (claims.role === "bus_marshal" && ride.marshal_admin_id !== Number(claims.sub)) {
      throw new ApiError(403, "You are not assigned to this ride");
    }
    if (ride.status !== "scheduled" && ride.status !== "boarding") {
      throw new ApiError(400, `Cannot start a trip that is ${ride.status}`);
    }

    const updated = await updateRideStatus(id, "active");
    recordAuditLog(claims, request, "UPDATE", "ride", id, { status: "active", via: "start-trip" });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
