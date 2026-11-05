import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { getBookingRow, markOnBoard } from "@/modules/booking/repository/bookings";
import { getRideRow } from "@/modules/booking/repository/rides";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/bookings/{id}/board-direct — the marshal conducting the ride
// (or ops) marking a passenger on board straight from the manifest, no QR
// scan or boarding code involved — they're already identifying the right
// person by picking them off the passenger list. Same bus_marshal-
// ownership check as board/no-show/end-trip/start-trip; unlike
// POST .../board (scan-based, used by both rider self-service and marshal
// scanning), this skips checkBoardingCode entirely.
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

    const updated = await markOnBoard(id);
    recordAuditLog(claims, request, "UPDATE", "booking", id, { boarded: true, via: "board-direct" });
    return NextResponse.json(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
