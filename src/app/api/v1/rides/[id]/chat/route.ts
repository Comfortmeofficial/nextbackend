import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listChatThreadsForRide } from "@/modules/booking/repository/chat";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/rides/{id}/chat — the marshal's inbox for a ride: one summary
// per rider who has written, so the admin app can flag new messages without
// opening every thread. Marshals only see the ride(s) they're assigned to.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const claims = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    if (claims.role === "bus_marshal") {
      const ride = await getRideRow(id);
      if (!ride || ride.marshal_admin_id !== Number(claims.sub)) {
        throw new ApiError(403, "You are not assigned to this ride");
      }
    }

    return NextResponse.json(await listChatThreadsForRide(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
