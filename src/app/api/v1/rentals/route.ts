import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleRouteError } from "@/lib/http-errors";
import { OPS_OR_MARSHAL_ROLES, requireAdminAuth } from "@/modules/admin/guard";
import { requireCustomerAuth } from "@/modules/auth/guard";
import { createRental, listRentals } from "@/modules/booking/repository/rentals";
import { rentalInputSchema } from "@/modules/booking/validation";
import type { RentalStatus } from "@/modules/booking/types";

// POST /api/v1/rentals — creates a rental request awaiting admin review; no
// price or payment method is set yet. Pricing happens via PATCH .../price.
export async function POST(request: NextRequest) {
  try {
    const input = rentalInputSchema.parse(await request.json());
    if (requireCustomerAuth(request) !== input.user_id) {
      throw new ApiError(403, "Not your account");
    }
    const rental = await createRental({
      userId: input.user_id,
      pickup: input.pickup,
      destination: input.destination,
      eventType: input.event_type,
      pickupDate: input.pickup_date,
      pickupTime: input.pickup_time,
      phone: input.phone,
      notes: input.notes,
      isRoundTrip: input.is_round_trip,
      returnDate: input.return_date,
      returnTime: input.return_time,
      paymentMethod: input.payment_method,
    });
    return NextResponse.json(rental, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

// GET /api/v1/rentals?skip=0&limit=50&status=&user_id= — a rider's own
// requests when user_id is given, otherwise the admin cross-user listing
// (matches the pattern admin_web_app's RentalsPage relies on: no user_id).
export async function GET(request: NextRequest) {
  try {
    const skip = Number(request.nextUrl.searchParams.get("skip") ?? "0") || 0;
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50") || 50;
    const status = (request.nextUrl.searchParams.get("status") || undefined) as
      | RentalStatus
      | undefined;
    const userId = Number(request.nextUrl.searchParams.get("user_id") ?? "0") || undefined;
    if (userId) {
      if (requireCustomerAuth(request) !== userId) {
        throw new ApiError(403, "Not your rentals");
      }
    } else {
      requireAdminAuth(request, OPS_OR_MARSHAL_ROLES);
    }
    const rentals = await listRentals(skip, limit, status, userId);
    return NextResponse.json(rentals);
  } catch (error) {
    return handleRouteError(error);
  }
}
