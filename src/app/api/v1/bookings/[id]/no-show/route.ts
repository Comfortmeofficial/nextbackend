import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { getBookingRow, markNoShow } from "@/modules/booking/repository/bookings";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/no-show — the marshal conducting the ride (or
// ops) records that a booked passenger never boarded. Same bus_marshal-
// ownership check as board/end-trip/start-trip.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const claims = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;

    const booking = await getBookingRow(id);
    if (!booking) throw new ApiError(404, "Booking not found");

    if (claims.role === "bus_marshal") {
      const ride = await getRideRow(booking.ride_id);
      if (!ride || ride.marshal_admin_id !== Number(claims.sub)) {
        throw new ApiError(403, "You are not assigned to this ride");
      }
    }
    if (booking.status === "cancelled") throw new ApiError(400, "This booking is cancelled");
    if (booking.is_on_board) throw new ApiError(400, "This passenger already boarded");

    const updated = await markNoShow(id);
    recordAuditLog(claims, request, "UPDATE", "booking", id, { no_show: true });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
