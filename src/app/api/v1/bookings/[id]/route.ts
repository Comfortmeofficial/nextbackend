import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { cancelBooking, getBooking } from "@/modules/booking/repository/bookings";
import { parseBookingId } from "@/modules/booking/util";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    const booking = await getBooking(id);
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
    requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const id = parseBookingId((await params).id);
    if (typeof id !== "number") return id;
    await cancelBooking(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
