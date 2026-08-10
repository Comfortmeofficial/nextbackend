import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { listAllBookings } from "@/modules/booking/repository/bookings";

// GET /api/v1/bookings/all?skip=0&limit=20&ride_id= — admin-facing,
// cross-user view. Not called by mobile (which uses /bookings?user_id=).
export async function GET(request: NextRequest) {
  try {
    requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? "0") || 0;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "20") || 20;
    const rideId = Number(request.nextUrl.searchParams.get("ride_id") ?? "0") || undefined;
    const bookings = await listAllBookings(skip, limit, rideId);
    return NextResponse.json(bookings);
  } catch (error) {
    return handleRouteError(error);
  }
}
