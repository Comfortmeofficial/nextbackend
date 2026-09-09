import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { recordAuditLog } from "@/modules/admin/audit";
import { requireOwnerOrAdmin } from "@/modules/auth/guard";
import { cancelBooking, getBooking } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

// Called by both admin (bookingsApi.get) and mobile (bookingService.getBooking).
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const booking = await getBooking(id);
    requireOwnerOrAdmin(request, booking.user_id, OPS_OR_MARSHAL_ROLES, "Not your booking");
    return NextResponse.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}

// DELETE /api/v1/bookings/{id} — admin/marshal-only direct cancel (mobile
// cancels via /api/v1/payment-hub/cancel-booking/{id}, which computes a
// refund; this one doesn't). A missing booking is a 400 here, not a 404
// (the source maps ANY Cancel() failure, GORM's "record not found"
// included, to 400).
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await cancelBooking(id);
    recordAuditLog(actor, request, "DELETE", "booking", id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
