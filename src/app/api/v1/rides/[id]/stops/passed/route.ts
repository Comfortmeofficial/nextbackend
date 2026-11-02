import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { getRideRow, setRidePassedStop } from "@/modules/booking/repository/rides";
import { loadFullRoute } from "@/modules/booking/repository/routes";
import { parseBookingId } from "@/modules/booking/util";
import { ridePassedStopInputSchema } from "@/modules/booking/validation";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/v1/rides/{id}/stops/passed — a marshal ticking off (or
// un-ticking) a pickup point as physically passed on this ride, so it
// stops being offered as a pickup choice for new bookings. stop_id null is
// the route's own starting point ("Default" pickup), not a route_stops row.
// Same bus_marshal-ownership check as start-trip/end-trip.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const claims = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    const ride = await getRideRow(id);
    if (!ride) throw new ApiError(404, "Ride not found");

    if (claims.role === "bus_marshal" && ride.marshal_admin_id !== Number(claims.sub)) {
      throw new ApiError(403, "You are not assigned to this ride");
    }

    const { stop_id, passed } = ridePassedStopInputSchema.parse(await request.json());
    if (stop_id !== null) {
      const route = await loadFullRoute(ride.route_id, true);
      if (!route || !route.stops.some((s) => s.stop_id === stop_id)) {
        throw new ApiError(400, `stop ${stop_id} is not one of this ride's route stops`);
      }
    }

    const updated = await setRidePassedStop(id, stop_id, passed);
    recordAuditLog(claims, request, "UPDATE", "ride", id, { passed_stop_id: stop_id ?? "origin", passed });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
